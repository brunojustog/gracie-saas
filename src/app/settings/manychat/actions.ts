"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

const schema = z.object({
  manychatWebhookSecret: z
    .string()
    .max(200)
    .nullable()
    .or(z.literal("").transform(() => null)),
  /**
   * v1.1-AB: identificador `fb...` da conta no ManyChat (visível na URL do
   * painel). Habilita o deep-link da conversa no card do kanban. Aceita
   * com ou sem o prefixo "fb"; só dígitos além dele.
   */
  manychatPageId: z
    .string()
    .max(50)
    .regex(/^(fb)?\d*$/i, "use o formato fb123456789 (ou só os números)")
    .nullable()
    .or(z.literal("").transform(() => null)),
});

export async function updateManychatConfig(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      manychatWebhookSecret: parsed.data.manychatWebhookSecret ?? null,
      manychatPageId: parsed.data.manychatPageId?.toLowerCase() ?? null,
    },
  });

  revalidatePath("/settings/manychat");
  return { ok: true };
}

/**
 * Gera um secret aleatório (32 bytes hex = 64 chars) pra o admin colar no
 * header da External Request do ManyChat. Não persiste — o form mostra o
 * valor e o admin salva via updateManychatConfig.
 */
export async function generateManychatSecret(): Promise<{
  ok: true;
  secret: string;
}> {
  await requireRole("ADMIN");
  return { ok: true, secret: randomBytes(32).toString("hex") };
}

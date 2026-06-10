"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

const schema = z.object({
  siteWebhookSecret: z
    .string()
    .max(200)
    .nullable()
    .or(z.literal("").transform(() => null)),
});

export async function updateSiteWebhookConfig(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      siteWebhookSecret: parsed.data.siteWebhookSecret ?? null,
    },
  });

  revalidatePath("/settings/site");
  return { ok: true };
}

/**
 * Gera um secret aleatório (32 bytes hex) pro admin colar no formulário do
 * site. Não persiste — o form mostra o valor e salva via
 * updateSiteWebhookConfig.
 */
export async function generateSiteWebhookSecret(): Promise<{
  ok: true;
  secret: string;
}> {
  await requireRole("ADMIN");
  return { ok: true, secret: randomBytes(32).toString("hex") };
}

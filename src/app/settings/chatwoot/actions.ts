"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

const schema = z.object({
  chatwootUrl: z.string().url().nullable().or(z.literal("").transform(() => null)),
  chatwootAccountId: z.number().int().positive().nullable(),
  chatwootApiToken: z.string().max(500).nullable().or(z.literal("").transform(() => null)),
  chatwootWebhookSecret: z.string().max(500).nullable().or(z.literal("").transform(() => null)),
});

export async function updateChatwootConfig(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      chatwootUrl: parsed.data.chatwootUrl ?? null,
      chatwootAccountId: parsed.data.chatwootAccountId ?? null,
      chatwootApiToken: parsed.data.chatwootApiToken ?? null,
      chatwootWebhookSecret: parsed.data.chatwootWebhookSecret ?? null,
    },
  });

  revalidatePath("/settings/chatwoot");
  return { ok: true };
}

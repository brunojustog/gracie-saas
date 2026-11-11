"use server";

import { randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getRecurrence, getSopAccessToken } from "@/server/cielo/client";
import { requireRole } from "@/server/tenant";

const optional = (max: number) =>
  z.string().trim().max(max).nullable().or(z.literal("").transform(() => null));

const schema = z.object({
  cieloEnvironment: z.enum(["sandbox", "production"]).nullable(),
  cieloMerchantId: optional(64),
  /** Vazio = mantém a chave salva (o form não reexibe segredo). */
  cieloMerchantKey: optional(128),
  cieloSopClientId: optional(128),
  cieloSopClientSecret: optional(256),
  cieloSoftDescriptor: optional(13),
});

type Result = { ok: true } | { ok: false; error: string };

export async function updateCieloConfig(input: unknown): Promise<Result> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");
  const d = parsed.data;

  const current = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: { cieloWebhookSecret: true },
  });

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      cieloEnvironment: d.cieloEnvironment,
      cieloMerchantId: d.cieloMerchantId,
      ...(d.cieloMerchantKey ? { cieloMerchantKey: d.cieloMerchantKey } : {}),
      cieloSopClientId: d.cieloSopClientId,
      ...(d.cieloSopClientSecret ? { cieloSopClientSecret: d.cieloSopClientSecret } : {}),
      cieloSoftDescriptor: d.cieloSoftDescriptor,
      // Gera o segredo do webhook na 1ª vez que a integração é ligada.
      ...(d.cieloEnvironment && !current?.cieloWebhookSecret
        ? { cieloWebhookSecret: randomBytes(24).toString("hex") }
        : {}),
    },
  });

  revalidatePath("/settings/cielo");
  return { ok: true };
}

export async function regenerateCieloWebhookSecret(): Promise<Result> {
  const { tenant } = await requireRole("ADMIN");
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { cieloWebhookSecret: randomBytes(24).toString("hex") },
  });
  revalidatePath("/settings/cielo");
  return { ok: true };
}

/**
 * Testa as credenciais salvas: consulta uma recorrência inexistente (404 =
 * credenciais ok; 401 = MerchantId/Key errados) e, se houver, o OAuth do SOP.
 */
export async function testCieloConnection(): Promise<
  { ok: true; api: string; sop: string } | { ok: false; error: string }
> {
  const { tenant } = await requireRole("ADMIN");
  const t = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: {
      cieloEnvironment: true,
      cieloMerchantId: true,
      cieloMerchantKey: true,
      cieloSopClientId: true,
      cieloSopClientSecret: true,
    },
  });
  if (!t?.cieloEnvironment || !t.cieloMerchantId || !t.cieloMerchantKey) {
    return { ok: false, error: "salve ambiente, MerchantId e MerchantKey antes de testar" };
  }
  const environment = t.cieloEnvironment as "sandbox" | "production";
  const probe = await getRecurrence(
    { environment, merchantId: t.cieloMerchantId, merchantKey: t.cieloMerchantKey },
    "00000000-0000-0000-0000-000000000000",
  );
  let api: string;
  if (probe.ok || probe.status === 404 || probe.status === 400) api = "credenciais da API ok";
  else if (probe.status === 401 || probe.status === 403) return { ok: false, error: "MerchantId/MerchantKey recusados pela Cielo" };
  else return { ok: false, error: `API Cielo: ${probe.message}` };

  let sop = environment === "sandbox"
    ? "sem Silent Order Post (no sandbox o cartão é tokenizado no servidor)"
    : "Silent Order Post NÃO configurado — obrigatório em produção";
  if (t.cieloSopClientId && t.cieloSopClientSecret) {
    const s = await getSopAccessToken({
      environment,
      merchantId: t.cieloMerchantId,
      clientId: t.cieloSopClientId,
      clientSecret: t.cieloSopClientSecret,
    });
    sop = s.ok ? "Silent Order Post ok" : `Silent Order Post: ${s.message}`;
  }
  return { ok: true, api, sop };
}

"use server";

/**
 * Ações PÚBLICAS (sem login) da página de cadastro do cartão (v1.3-A).
 * A autorização é o próprio token do link: válido, não expirado, matrícula
 * ativa. Depois de usado com sucesso o token é zerado (link de uso único).
 */
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { getSopAccessToken, sandboxTokenizeCard } from "@/server/cielo/client";
import { activateRecurrence, getTenantCielo, type ActivateResult } from "@/server/cielo/recurrence";

const BRANDS = ["Visa", "Master", "Amex", "Elo", "Hipercard", "Diners", "Discover", "JCB"] as const;

async function resolveLink(token: string) {
  if (!token || token.length < 24) return null;
  const enrollment = await prisma.enrollment.findUnique({
    where: { cieloCardLinkToken: token },
    select: { id: true, tenantId: true, status: true, cieloCardLinkExpiresAt: true },
  });
  if (!enrollment || enrollment.status !== "ACTIVE") return null;
  if (!enrollment.cieloCardLinkExpiresAt || enrollment.cieloCardLinkExpiresAt < new Date()) return null;
  const cielo = await getTenantCielo(enrollment.tenantId);
  if (!cielo) return null;
  return { enrollment, cielo };
}

/** Novo AccessToken do SOP (é de uso único — precisa de outro a cada tentativa). */
export async function refreshSopToken(
  token: string,
): Promise<{ ok: true; accessToken: string } | { ok: false; error: string }> {
  const link = await resolveLink(token);
  if (!link) return { ok: false, error: "link inválido ou expirado" };
  const { cielo } = link;
  if (!cielo.sopClientId || !cielo.sopClientSecret) return { ok: false, error: "tokenização indisponível" };
  const r = await getSopAccessToken({
    environment: cielo.environment,
    merchantId: cielo.merchantId,
    clientId: cielo.sopClientId,
    clientSecret: cielo.sopClientSecret,
  });
  return r.ok ? { ok: true, accessToken: r.data.accessToken } : { ok: false, error: r.message };
}

const tokenSchema = z.object({
  token: z.string().min(24),
  cardToken: z.string().uuid(),
  brand: z.enum(BRANDS),
  last4: z.string().regex(/^\d{4}$/),
});

/** Produção: o cartão já foi tokenizado no navegador (Silent Order Post). */
export async function activateWithCardToken(input: unknown): Promise<ActivateResult> {
  const parsed = tokenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "dados inválidos" };
  const link = await resolveLink(parsed.data.token);
  if (!link) return { ok: false, error: "link inválido ou expirado — peça um novo à academia" };
  return activateRecurrence(link.cielo, {
    enrollmentId: link.enrollment.id,
    cardToken: parsed.data.cardToken,
    brand: parsed.data.brand,
    last4: parsed.data.last4,
  });
}

const sandboxSchema = z.object({
  token: z.string().min(24),
  number: z.string().regex(/^\d{12,19}$/),
  holder: z.string().trim().min(2).max(60),
  expiration: z.string().regex(/^(0[1-9]|1[0-2])\/\d{4}$/),
  brand: z.enum(BRANDS),
});

/**
 * SÓ SANDBOX: a conta de testes da Cielo não tem credencial de SOP, então o
 * cartão de TESTE é tokenizado no servidor. `sandboxTokenizeCard` recusa se
 * o tenant estiver em produção.
 */
export async function activateSandbox(input: unknown): Promise<ActivateResult> {
  const parsed = sandboxSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "dados do cartão inválidos" };
  const link = await resolveLink(parsed.data.token);
  if (!link) return { ok: false, error: "link inválido ou expirado — peça um novo à academia" };
  if (link.cielo.environment !== "sandbox") return { ok: false, error: "modo indisponível" };

  const tk = await sandboxTokenizeCard(link.cielo, {
    number: parsed.data.number,
    holder: parsed.data.holder,
    expiration: parsed.data.expiration,
    brand: parsed.data.brand,
  });
  if (!tk.ok) return { ok: false, error: `Cielo: ${tk.message}` };

  return activateRecurrence(link.cielo, {
    enrollmentId: link.enrollment.id,
    cardToken: tk.data.CardToken,
    brand: parsed.data.brand,
    last4: parsed.data.number.slice(-4),
  });
}

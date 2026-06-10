/**
 * Webhook de leads do site (v1.1-AB).
 *
 * Pipeline (espelha o receiver do ManyChat):
 *   1. Resolve tenant pelo slug da URL
 *   2. Valida secret (se configurado): header X-Site-Webhook-Secret OU
 *      query ?secret= (form builders nem sempre deixam setar header)
 *   3. Persiste o payload em WebhookLog (auditoria)
 *   4. Parseia com Zod e cria/atualiza o Lead (dedup telefone/e-mail)
 *
 * Sempre retorna 200 quando tenant + secret são válidos — mesmo em erro de
 * processamento (form builders retentariam, duplicando WebhookLog).
 *
 * Códigos de erro:
 *   404 — tenant não encontrado / inativo
 *   401 — secret configurado mas ausente / divergente
 *   400 — payload não é JSON válido ou sem `name`
 */
import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  siteLeadPayloadSchema,
  upsertLeadFromSite,
} from "@/server/site-webhook";

export const runtime = "nodejs";

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug, active: true },
    select: { id: true, siteWebhookSecret: true },
  });

  if (!tenant) {
    return NextResponse.json(
      { error: "tenant não encontrado" },
      { status: 404 },
    );
  }

  if (tenant.siteWebhookSecret) {
    const url = new URL(request.url);
    const provided =
      request.headers.get("x-site-webhook-secret") ??
      url.searchParams.get("secret");
    if (!provided || !safeCompare(provided, tenant.siteWebhookSecret)) {
      return NextResponse.json({ error: "secret inválido" }, { status: 401 });
    }
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "payload não é JSON válido" },
      { status: 400 },
    );
  }

  const log = await prisma.webhookLog.create({
    data: {
      tenantId: tenant.id,
      source: "site",
      eventType: "lead",
      payload: payload as object,
      processed: false,
    },
    select: { id: true },
  });

  const parsed = siteLeadPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { processed: true, error: "payload inválido (name obrigatório)" },
    });
    return NextResponse.json(
      { error: "payload inválido — campo `name` é obrigatório" },
      { status: 400 },
    );
  }

  try {
    const result = await upsertLeadFromSite(tenant.id, parsed.data);
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { processed: true },
    });
    return NextResponse.json({ status: "ok", ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { processed: true, error: message },
    });
    return NextResponse.json({ status: "error", error: message });
  }
}

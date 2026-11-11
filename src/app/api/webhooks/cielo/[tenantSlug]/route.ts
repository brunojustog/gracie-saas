/**
 * Post de Notificação da Cielo (v1.3-A).
 *
 * Cadastro (site da Cielo → E-commerce → Gestão API E-commerce →
 * Configurações → URL de notificações):
 *   URL:    https://<tenant>.app.simplifica.com.br/api/webhooks/cielo/<tenantSlug>
 *   Header: X-Cielo-Secret = <Tenant.cieloWebhookSecret>
 *
 * Payload: { PaymentId, RecurrentPaymentId?, ChangeType }. Só IDs — a baixa é
 * feita a partir da CONSULTA à API da Cielo (handleCieloNotification), nunca
 * do corpo do POST.
 *
 * Respostas: 200 sempre que tenant + secret são válidos (a Cielo exige 200;
 * erro de processamento fica no WebhookLog e o cron concilia depois).
 *   404 tenant inexistente / Cielo não configurada · 401 secret inválido
 */
import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  type CieloNotification,
  getTenantCielo,
  handleCieloNotification,
} from "@/server/cielo/recurrence";

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
    select: { id: true, cieloWebhookSecret: true },
  });
  if (!tenant) return NextResponse.json({ error: "tenant não encontrado" }, { status: 404 });

  const cielo = await getTenantCielo(tenant.id);
  if (!cielo) return NextResponse.json({ error: "integração Cielo não configurada" }, { status: 404 });

  if (tenant.cieloWebhookSecret) {
    const provided = request.headers.get("x-cielo-secret") ?? "";
    if (!provided || !safeCompare(provided, tenant.cieloWebhookSecret)) {
      return NextResponse.json({ error: "secret inválido" }, { status: 401 });
    }
  }

  let payload: CieloNotification;
  try {
    payload = (await request.json()) as CieloNotification;
  } catch {
    return NextResponse.json({ error: "payload não é JSON válido" }, { status: 400 });
  }

  const log = await prisma.webhookLog.create({
    data: {
      tenantId: tenant.id,
      source: "cielo",
      eventType: `change_${payload?.ChangeType ?? "?"}`,
      payload: payload as object,
      processed: false,
    },
    select: { id: true },
  });

  try {
    const result = await handleCieloNotification(cielo, payload ?? {});
    await prisma.webhookLog.update({ where: { id: log.id }, data: { processed: true } });
    return NextResponse.json({ status: "ok", result });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[webhooks/cielo]", message);
    await prisma.webhookLog.update({ where: { id: log.id }, data: { processed: true, error: message } });
    return NextResponse.json({ status: "error", error: message });
  }
}

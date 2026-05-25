/**
 * Webhook receiver do ManyChat (v1.1-AA — webhook-in only).
 *
 * Pipeline de cada request (espelha o receiver do Chatwoot):
 *   1. Resolve tenant pelo slug da URL
 *   2. Valida secret (se configurado) via header X-Manychat-Secret com
 *      timingSafeEqual. ManyChat não tem assinatura HMAC nativa — o admin
 *      configura esse header no "External Request" da automação.
 *   3. Lê body cru, persiste em WebhookLog (auditoria + idempotency raw)
 *   4. Parseia com Zod (discriminated union dos 5 eventos tratados)
 *   5. Dispatcha pro handler correspondente
 *   6. Marca WebhookLog.processed=true ou registra error
 *
 * Sempre retorna 200 quando o tenant é válido — mesmo em erro de processamento.
 * Razão: ManyChat retentaria, multiplicando entradas em WebhookLog.
 *
 * Códigos de erro:
 *   404 — tenant não encontrado / inativo
 *   401 — secret configurado mas header ausente / divergente
 *   400 — payload não é JSON válido
 */
import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  handleConversationEnded,
  handleConversationStarted,
  handleFlowResponse,
  handleSubscriberCreated,
  handleTagApplied,
  type HandlerResult,
} from "@/server/manychat/handlers";
import {
  anyManychatEventSchema,
  handledEventSchema,
} from "@/server/manychat/types";

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
    select: { id: true, manychatWebhookSecret: true },
  });

  if (!tenant) {
    return NextResponse.json(
      { error: "tenant não encontrado" },
      { status: 404 },
    );
  }

  // Secret check apenas se o tenant configurou um. Sem secret = aceita
  // qualquer request (modo dev / setup inicial).
  if (tenant.manychatWebhookSecret) {
    const provided = request.headers.get("x-manychat-secret");
    if (!provided || !safeCompare(provided, tenant.manychatWebhookSecret)) {
      return NextResponse.json(
        { error: "secret inválido" },
        { status: 401 },
      );
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

  const generic = anyManychatEventSchema.safeParse(payload);
  const eventType = generic.success ? generic.data.event : "unknown";

  const log = await prisma.webhookLog.create({
    data: {
      tenantId: tenant.id,
      source: "manychat",
      eventType,
      payload: payload as object,
      processed: false,
    },
    select: { id: true },
  });

  const handled = handledEventSchema.safeParse(payload);
  if (!handled.success) {
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { processed: true },
    });
    return NextResponse.json({ status: "logged", eventType });
  }

  let result: HandlerResult;
  try {
    switch (handled.data.event) {
      case "subscriber_created":
        result = await handleSubscriberCreated(tenant.id, handled.data);
        break;
      case "tag_applied":
        result = await handleTagApplied(tenant.id, handled.data);
        break;
      case "flow_response":
        result = await handleFlowResponse(tenant.id, handled.data);
        break;
      case "conversation_started":
        result = await handleConversationStarted(tenant.id, handled.data);
        break;
      case "conversation_ended":
        result = await handleConversationEnded(tenant.id, handled.data);
        break;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { processed: true, error: message },
    });
    return NextResponse.json({ status: "error", error: message });
  }

  await prisma.webhookLog.update({
    where: { id: log.id },
    data: { processed: true },
  });

  return NextResponse.json({ status: "ok", ...result });
}

/**
 * Webhook receiver do Chatwoot.
 *
 * Pipeline de cada request:
 *   1. Resolve tenant pelo slug da URL
 *   2. Valida secret (se configurado) via header X-Chatwoot-Webhook-Secret
 *      com timingSafeEqual
 *   3. Lê body cru, persiste em WebhookLog (auditoria + idempotency raw)
 *   4. Parseia com Zod (discriminated union dos 3 events tratados)
 *   5. Dispatcha pro handler correspondente
 *   6. Marca WebhookLog.processed=true ou registra error
 *
 * Sempre retorna 200 quando o tenant é válido — mesmo em erro de processamento.
 * Razão: Chatwoot retentaria, multiplicando entradas em WebhookLog. Com 200,
 * a falha fica registrada e pode ser reprocessada manualmente (futuro
 * endpoint /replay).
 *
 * Códigos de erro reservados:
 *   404 — tenant não encontrado / inativo
 *   401 — secret configurado mas header ausente / divergente
 *   400 — payload não é JSON válido
 */
import { timingSafeEqual } from "node:crypto";

import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import {
  handleContactCreated,
  handleConversationCreated,
  handleMessageCreated,
  type HandlerResult,
} from "@/server/chatwoot/handlers";
import {
  anyChatwootEventSchema,
  handledEventSchema,
} from "@/server/chatwoot/types";

export const runtime = "nodejs";

/** Compara duas strings em tempo constante. Retorna false se tamanhos diferem. */
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
    select: { id: true, chatwootWebhookSecret: true },
  });

  if (!tenant) {
    return NextResponse.json(
      { error: "tenant não encontrado" },
      { status: 404 },
    );
  }

  // Secret check (apenas se o tenant configurou um). Em modo "sem secret"
  // (ex: setup inicial / dev), aceita qualquer request — é o único modo onde
  // o Chatwoot consegue mandar antes do operador colar o token.
  if (tenant.chatwootWebhookSecret) {
    const provided = request.headers.get("x-chatwoot-webhook-secret");
    if (!provided || !safeCompare(provided, tenant.chatwootWebhookSecret)) {
      return NextResponse.json(
        { error: "secret inválido" },
        { status: 401 },
      );
    }
  }

  // Parse JSON ANTES do log porque o log armazena Json estruturado, não bytes.
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "payload não é JSON válido" },
      { status: 400 },
    );
  }

  // Discrimina o tipo de evento mesmo se for um que não tratamos — pra ter
  // estatística no log.
  const generic = anyChatwootEventSchema.safeParse(payload);
  const eventType = generic.success ? generic.data.event : "unknown";

  const log = await prisma.webhookLog.create({
    data: {
      tenantId: tenant.id,
      source: "chatwoot",
      eventType,
      payload: payload as object,
      processed: false,
    },
    select: { id: true },
  });

  // Tenta parsear como evento que tratamos. Se for outro tipo (ex:
  // conversation_status_changed), só logamos e marcamos processed.
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
      case "conversation_created":
        result = await handleConversationCreated(tenant.id, handled.data);
        break;
      case "contact_created":
        result = await handleContactCreated(tenant.id, handled.data);
        break;
      case "message_created":
        result = await handleMessageCreated(tenant.id, handled.data);
        break;
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { processed: true, error: message },
    });
    // 200 mesmo em erro — Chatwoot retentaria e duplicaria os logs.
    return NextResponse.json({ status: "error", error: message });
  }

  await prisma.webhookLog.update({
    where: { id: log.id },
    data: { processed: true },
  });

  return NextResponse.json({ status: "ok", ...result });
}

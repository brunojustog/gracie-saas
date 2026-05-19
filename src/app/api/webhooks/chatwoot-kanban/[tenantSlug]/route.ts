/**
 * Webhook receiver do plugin de Kanban do Chatwoot (v1.1-V).
 *
 * Configurar no Chatwoot em:
 *   Kanban → Configurações → Webhook → URL:
 *     https://<host>/api/webhooks/chatwoot-kanban/<tenantSlug>
 *
 * Eventos suportados:
 *   - kanban.item.created  → cria/atualiza lead correspondente à conversa
 *
 * Outros eventos do plugin (item.updated/deleted, stage_changed,
 * items_reordered) são logados em WebhookLog e ignorados — escopo futuro.
 *
 * Autenticação: SEM secret (o plugin não suporta custom headers). Mitigação:
 * o handler valida que `account_id` do payload bate com `tenant.chatwootAccountId`
 * antes de processar. tenantSlug na URL não é segredo mas filtra ataque casual.
 *
 * Sempre retorna 200 quando o tenant é válido (mesma razão do webhook nativo:
 * evita retries que duplicariam entradas em WebhookLog).
 */
import { NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { handleKanbanItemCreated } from "@/server/chatwoot/kanban-handler";
import {
  anyKanbanEventSchema,
  kanbanItemCreatedSchema,
} from "@/server/chatwoot/kanban-types";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tenantSlug: string }> },
) {
  const { tenantSlug } = await params;

  const tenant = await prisma.tenant.findUnique({
    where: { slug: tenantSlug, active: true },
    select: { id: true },
  });

  if (!tenant) {
    return NextResponse.json(
      { error: "tenant não encontrado" },
      { status: 404 },
    );
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

  const generic = anyKanbanEventSchema.safeParse(payload);
  const eventType = generic.success ? generic.data.event : "unknown";

  const log = await prisma.webhookLog.create({
    data: {
      tenantId: tenant.id,
      source: "chatwoot-kanban",
      eventType,
      payload: payload as object,
      processed: false,
    },
    select: { id: true },
  });

  // Tratamos só kanban.item.created por enquanto. Outros eventos do plugin
  // ficam logados pra inspeção/uso futuro.
  if (eventType !== "kanban.item.created") {
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: { processed: true },
    });
    return NextResponse.json({ status: "logged", eventType });
  }

  const parsed = kanbanItemCreatedSchema.safeParse(payload);
  if (!parsed.success) {
    await prisma.webhookLog.update({
      where: { id: log.id },
      data: {
        processed: true,
        error: `parse falhou: ${parsed.error.message}`,
      },
    });
    return NextResponse.json({ status: "parse_error", eventType });
  }

  try {
    const result = await handleKanbanItemCreated(tenant.id, parsed.data);
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

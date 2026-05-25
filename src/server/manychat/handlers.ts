/**
 * Handlers que aplicam mudanças no banco a partir de eventos do ManyChat.
 *
 * Idempotência: dedup key é `(tenantId, manychatSubscriberId)`. Mesmo
 * subscriber disparando múltiplos eventos atualiza o mesmo Lead.
 *
 * Política de visibilidade do lead segue v1.1-O (qualquer role no tenant
 * vê) — sem auto-assignment de vendedora no MVP.
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { appendLeadNote } from "@/server/lead-notes";

import {
  channelToOrigin,
  fallbackSubscriberName,
  normalizeId,
} from "./mapper";
import type { HandledManychatEvent } from "./types";

export type HandlerResult =
  | { kind: "created"; leadId: string }
  | { kind: "updated"; leadId: string }
  | { kind: "skipped"; reason: string };

type Subscriber = Extract<
  HandledManychatEvent,
  { event: "subscriber_created" }
>["subscriber"];

/**
 * Resolve o stage inicial do tenant (primeiro `active` por `order` ASC).
 * Lança se não existir — significa que o seed/setup do tenant está incompleto.
 */
async function getInitialStageId(tenantId: string): Promise<string> {
  const stage = await prisma.stage.findFirst({
    where: { tenantId, active: true },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  if (!stage) {
    throw new Error(
      `Tenant ${tenantId} não tem nenhum stage ativo. Rode \`npm run db:seed\` ou crie estágios em /settings.`,
    );
  }
  return stage.id;
}

/**
 * Acha lead por manychatSubscriberId (excluindo soft-deletados — política
 * v1.1-W: lead apagado não "ressuscita" sozinho, cria-se um novo).
 */
async function findLeadBySubscriber(
  tenantId: string,
  subscriberId: string,
): Promise<{ id: string; tags: string[] } | null> {
  return prisma.lead.findFirst({
    where: {
      tenantId,
      manychatSubscriberId: subscriberId,
      deletedAt: null,
    },
    select: { id: true, tags: true },
  });
}

/**
 * Cria ou atualiza Lead a partir de subscriber do ManyChat.
 * Idempotente em (tenantId, manychatSubscriberId).
 */
export async function upsertLeadFromSubscriber(params: {
  tenantId: string;
  subscriber: Subscriber;
  /** Se true, atualiza `firstInteractionAt` quando lead novo. */
  isFirstContact?: boolean;
}): Promise<HandlerResult> {
  const { tenantId, subscriber, isFirstContact = true } = params;

  const subscriberId = normalizeId(subscriber.id);
  if (!subscriberId) {
    return { kind: "skipped", reason: "subscriber sem id válido" };
  }

  const existing = await findLeadBySubscriber(tenantId, subscriberId);
  const now = new Date();
  const channel = subscriber.channel ?? null;

  if (existing) {
    // Atualiza só campos não-vazios — não sobrescreve dados já preenchidos
    // pelo atendente com null/undefined que o subscriber não enviou.
    const update: Prisma.LeadUncheckedUpdateInput = {
      lastInteractionAt: now,
    };
    const newName = fallbackSubscriberName(subscriber);
    if (subscriber.phone) update.phone = subscriber.phone;
    if (subscriber.email) update.email = subscriber.email;
    if (newName && newName !== "Contato ManyChat") update.name = newName;

    await prisma.lead.update({ where: { id: existing.id }, data: update });
    return { kind: "updated", leadId: existing.id };
  }

  const stageId = await getInitialStageId(tenantId);
  const created = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        tenantId,
        stageId,
        name: fallbackSubscriberName(subscriber),
        phone: subscriber.phone ?? null,
        email: subscriber.email ?? null,
        origin: channelToOrigin(channel),
        manychatSubscriberId: subscriberId,
        firstInteractionAt: isFirstContact ? now : now,
        lastInteractionAt: now,
      },
    });
    await tx.stageHistory.create({
      data: {
        leadId: lead.id,
        toStageId: stageId,
        notes: "Lead criado via webhook do ManyChat",
      },
    });
    return lead;
  });

  return { kind: "created", leadId: created.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Handlers por evento
// ──────────────────────────────────────────────────────────────────────────

export async function handleSubscriberCreated(
  tenantId: string,
  event: Extract<HandledManychatEvent, { event: "subscriber_created" }>,
): Promise<HandlerResult> {
  return upsertLeadFromSubscriber({
    tenantId,
    subscriber: event.subscriber,
    isFirstContact: true,
  });
}

export async function handleTagApplied(
  tenantId: string,
  event: Extract<HandledManychatEvent, { event: "tag_applied" }>,
): Promise<HandlerResult> {
  // Garante que o lead existe — se a tag chega antes do subscriber_created
  // (ordem de webhook não é garantida), upsert cria o lead na hora.
  const upsert = await upsertLeadFromSubscriber({
    tenantId,
    subscriber: event.subscriber,
    isFirstContact: false,
  });
  if (upsert.kind === "skipped") return upsert;

  const tag = event.tag.trim();
  if (!tag) return { kind: "skipped", reason: "tag vazia" };

  const lead = await prisma.lead.findUnique({
    where: { id: upsert.leadId },
    select: { tags: true },
  });
  if (!lead) return { kind: "skipped", reason: "lead sumiu entre upsert e read" };

  if (!lead.tags.includes(tag)) {
    await prisma.lead.update({
      where: { id: upsert.leadId },
      data: { tags: [...lead.tags, tag] },
    });
  }

  await appendLeadNote({
    tenantId,
    leadId: upsert.leadId,
    kind: "MANYCHAT_EVENT",
    body: `Tag "${tag}" aplicada via ManyChat`,
    metadata: { event: "tag_applied", tag },
  });

  return { kind: "updated", leadId: upsert.leadId };
}

export async function handleFlowResponse(
  tenantId: string,
  event: Extract<HandledManychatEvent, { event: "flow_response" }>,
): Promise<HandlerResult> {
  const upsert = await upsertLeadFromSubscriber({
    tenantId,
    subscriber: event.subscriber,
    isFirstContact: false,
  });
  if (upsert.kind === "skipped") return upsert;

  const fields = event.fields ?? {};
  const entries = Object.entries(fields).filter(
    ([, v]) => v !== null && v !== undefined && String(v).trim() !== "",
  );

  // Body legível mostrando key=value. Se não veio nenhum field, ainda
  // registra a chegada do evento.
  const body =
    entries.length > 0
      ? `Flow respondido no ManyChat:\n${entries
          .map(([k, v]) => `• ${k}: ${String(v)}`)
          .join("\n")}`
      : "Flow respondido no ManyChat (sem campos preenchidos)";

  await appendLeadNote({
    tenantId,
    leadId: upsert.leadId,
    kind: "MANYCHAT_EVENT",
    body,
    // `fields` é `Record<string, unknown>` — não casa direto com
    // InputJsonValue (que recusa `unknown`). JSON.parse(JSON.stringify(...))
    // normaliza valores não-JSON em null e remove undefineds.
    metadata: {
      event: "flow_response",
      fields: JSON.parse(JSON.stringify(fields)) as Prisma.InputJsonValue,
    },
  });

  return { kind: "updated", leadId: upsert.leadId };
}

export async function handleConversationStarted(
  tenantId: string,
  event: Extract<HandledManychatEvent, { event: "conversation_started" }>,
): Promise<HandlerResult> {
  const upsert = await upsertLeadFromSubscriber({
    tenantId,
    subscriber: event.subscriber,
    isFirstContact: false,
  });
  if (upsert.kind === "skipped") return upsert;

  await appendLeadNote({
    tenantId,
    leadId: upsert.leadId,
    kind: "MANYCHAT_EVENT",
    body: "Conversa iniciada no ManyChat",
    metadata: { event: "conversation_started" },
  });

  return { kind: "updated", leadId: upsert.leadId };
}

export async function handleConversationEnded(
  tenantId: string,
  event: Extract<HandledManychatEvent, { event: "conversation_ended" }>,
): Promise<HandlerResult> {
  const upsert = await upsertLeadFromSubscriber({
    tenantId,
    subscriber: event.subscriber,
    isFirstContact: false,
  });
  if (upsert.kind === "skipped") return upsert;

  await appendLeadNote({
    tenantId,
    leadId: upsert.leadId,
    kind: "MANYCHAT_EVENT",
    body: "Conversa encerrada no ManyChat",
    metadata: { event: "conversation_ended" },
  });

  return { kind: "updated", leadId: upsert.leadId };
}

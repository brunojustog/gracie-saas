/**
 * Handlers que aplicam mudanças no banco a partir de eventos do Chatwoot.
 *
 * Idempotência: o Chatwoot pode reenviar o mesmo evento (retry após 5xx
 * ou timeout). A dedup key é `(tenantId, chatwootContactId)` — buscamos
 * sempre antes de criar.
 *
 * Auto-assignment de vendedora não está implementado no MVP (a spec
 * menciona como futuro). Lead nasce sem `assignedSellerId`.
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { appendLeadNote } from "@/server/lead-notes";
import { enqueueWelcomeSequence, pauseLeadJobs } from "@/server/messaging";

import {
  channelToOrigin,
  fallbackContactName,
  normalizeId,
} from "./mapper";
import type { HandledChatwootEvent } from "./types";

export type HandlerResult =
  | { kind: "created"; leadId: string }
  | { kind: "updated"; leadId: string }
  | { kind: "skipped"; reason: string };

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
 * Cria ou atualiza Lead a partir de um contato do Chatwoot.
 * Idempotente em (tenantId, chatwootContactId).
 */
async function upsertLeadFromContact(params: {
  tenantId: string;
  contact: {
    id: string;
    name?: string | null;
    email?: string | null;
    phone_number?: string | null;
    identifier?: string | null;
  };
  channel?: string | null;
  conversationId?: string | null;
  inboxId?: number | string | null;
}): Promise<HandlerResult> {
  const { tenantId, contact, channel, conversationId, inboxId } = params;

  const existing = await prisma.lead.findFirst({
    where: { tenantId, chatwootContactId: contact.id },
    select: { id: true },
  });

  const now = new Date();
  const inboxIdNum =
    inboxId === null || inboxId === undefined
      ? null
      : Number.isFinite(Number(inboxId))
        ? Number(inboxId)
        : null;

  const data: Prisma.LeadUncheckedUpdateInput = {
    name: fallbackContactName(contact),
    phone: contact.phone_number ?? undefined,
    email: contact.email ?? undefined,
    chatwootConversationId: conversationId ?? undefined,
    chatwootInboxId: inboxIdNum ?? undefined,
    lastInteractionAt: now,
  };

  if (existing) {
    await prisma.lead.update({ where: { id: existing.id }, data });
    return { kind: "updated", leadId: existing.id };
  }

  const stageId = await getInitialStageId(tenantId);

  const created = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        tenantId,
        stageId,
        name: fallbackContactName(contact),
        phone: contact.phone_number ?? null,
        email: contact.email ?? null,
        origin: channelToOrigin(channel),
        chatwootContactId: contact.id,
        chatwootConversationId: conversationId ?? null,
        chatwootInboxId: inboxIdNum,
        firstInteractionAt: now,
        lastInteractionAt: now,
      },
    });
    await tx.stageHistory.create({
      data: {
        leadId: lead.id,
        toStageId: stageId,
        notes: "Lead criado via webhook do Chatwoot",
      },
    });
    return lead;
  });

  // Lead novo → dispara a cadência de follow-up de Novo Lead (8 mensagens em
  // 7 dias). Isolado em try/catch pra não derrubar o webhook se Wuzapi/schedule
  // tiver problema — o cron sobe os jobs de qualquer jeito quando os credenciais
  // estiverem configurados.
  try {
    await enqueueWelcomeSequence(created.id, now);
  } catch (err) {
    console.error("[followup] enqueueWelcomeSequence falhou", err);
  }

  return { kind: "created", leadId: created.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Handlers por evento
// ──────────────────────────────────────────────────────────────────────────

export async function handleConversationCreated(
  tenantId: string,
  event: Extract<HandledChatwootEvent, { event: "conversation_created" }>,
): Promise<HandlerResult> {
  const sender = event.meta?.sender;
  if (!sender) {
    return { kind: "skipped", reason: "conversation_created sem meta.sender" };
  }

  const contactId = normalizeId(sender.id);
  if (!contactId) {
    return { kind: "skipped", reason: "sender sem id válido" };
  }

  return upsertLeadFromContact({
    tenantId,
    contact: {
      id: contactId,
      name: sender.name ?? null,
      email: sender.email ?? null,
      phone_number: sender.phone_number ?? null,
      identifier: sender.identifier ?? null,
    },
    channel: event.channel ?? event.meta?.channel ?? null,
    conversationId: normalizeId(event.id),
    inboxId: event.inbox_id ?? null,
  });
}

export async function handleContactCreated(
  tenantId: string,
  event: Extract<HandledChatwootEvent, { event: "contact_created" }>,
): Promise<HandlerResult> {
  const contactId = normalizeId(event.id);
  if (!contactId) {
    return { kind: "skipped", reason: "contact_created sem id" };
  }

  return upsertLeadFromContact({
    tenantId,
    contact: {
      id: contactId,
      name: event.name ?? null,
      email: event.email ?? null,
      phone_number: event.phone_number ?? null,
      identifier: event.identifier ?? null,
    },
    channel: null,
    conversationId: null,
    inboxId: null,
  });
}

export async function handleMessageCreated(
  tenantId: string,
  event: Extract<HandledChatwootEvent, { event: "message_created" }>,
): Promise<HandlerResult> {
  // Apenas mensagens de entrada (do contato) atualizam interação. Mensagens
  // do agente não significam nova interação do lead.
  const isIncoming = String(event.message_type ?? "0") === "0";
  if (!isIncoming) {
    return { kind: "skipped", reason: "outgoing message (do agente)" };
  }

  const sender = event.sender ?? event.conversation?.meta?.sender;
  if (!sender) {
    return { kind: "skipped", reason: "message_created sem sender" };
  }

  const contactId = normalizeId(sender.id);
  if (!contactId) {
    return { kind: "skipped", reason: "sender sem id válido" };
  }

  // Se o Lead já existe, atualiza só lastInteractionAt. Caso contrário, cria
  // (cobre o caso onde conversation_created não chegou — webhook fora de ordem).
  const existing = await prisma.lead.findFirst({
    where: { tenantId, chatwootContactId: contactId },
    select: { id: true },
  });

  if (existing) {
    await prisma.lead.update({
      where: { id: existing.id },
      data: { lastInteractionAt: new Date() },
    });
    // Lead respondeu → pausa o follow-up (M2..M8 que ainda não dispararam).
    // Isolado em try/catch pra não bloquear o webhook se algo der errado.
    try {
      await pauseLeadJobs(existing.id, "lead respondeu via Chatwoot");
    } catch (err) {
      console.error("[followup] pauseLeadJobs falhou", err);
    }
    // Registra no diário — useful pra reconstruir timeline depois.
    await appendLeadNote({
      tenantId,
      leadId: existing.id,
      kind: "WHATSAPP_REPLY",
      body: "Lead respondeu no WhatsApp",
    });
    return { kind: "updated", leadId: existing.id };
  }

  return upsertLeadFromContact({
    tenantId,
    contact: {
      id: contactId,
      name: sender.name ?? null,
      email: sender.email ?? null,
      phone_number: sender.phone_number ?? null,
      identifier: sender.identifier ?? null,
    },
    channel: event.conversation?.channel ?? null,
    conversationId: normalizeId(event.conversation?.id),
    inboxId: event.conversation?.inbox_id ?? null,
  });
}

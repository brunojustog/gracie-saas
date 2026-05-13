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

/** Tag adicionada ao lead quando ele responde no WhatsApp; removida quando o agente responde de volta. */
const NEW_REPLY_TAG = "Nova resposta";

export async function handleMessageCreated(
  tenantId: string,
  event: Extract<HandledChatwootEvent, { event: "message_created" }>,
): Promise<HandlerResult> {
  const isIncoming = String(event.message_type ?? "0") === "0";

  // Outgoing (mensagem do agente) → não conta como interação do lead, mas
  // serve pra LIMPAR a tag "Nova resposta" se estiver presente. Assim o
  // alerta visual no kanban some quando alguém efetivamente atendeu.
  if (!isIncoming) {
    const sender = event.conversation?.meta?.sender;
    const contactId = normalizeId(sender?.id);
    if (contactId) {
      const lead = await prisma.lead.findFirst({
        where: { tenantId, chatwootContactId: contactId },
        select: { id: true, tags: true },
      });
      if (lead?.tags.includes(NEW_REPLY_TAG)) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { tags: lead.tags.filter((t) => t !== NEW_REPLY_TAG) },
        });
      }
    }
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
    select: {
      id: true,
      tags: true,
      stageId: true,
      stage: { select: { name: true } },
    },
  });

  if (existing) {
    const now = new Date();

    // Pausa SÓ a cadência welcome — lembretes de aula experimental e mensagem
    // pós-aula continuam disparando (são transacionais, não devem ser
    // canceladas só porque o lead mandou um "ok").
    try {
      await pauseLeadJobs(existing.id, "lead respondeu via Chatwoot", { kind: "welcome" });
    } catch (err) {
      console.error("[followup] pauseLeadJobs falhou", err);
    }

    // Auto-promove "Novo Lead" → "Potencial" quando a resposta chega na fase
    // inicial. Se já está em qualquer outro stage, mantém (não regredir nem
    // pular etapas — o atendente decide o próximo passo).
    let movedToPotential = false;
    if (existing.stage.name === "Novo Lead") {
      const potential = await prisma.stage.findFirst({
        where: { tenantId, name: "Potencial", active: true },
        select: { id: true },
      });
      if (potential) {
        await prisma.$transaction(async (tx) => {
          await tx.lead.update({
            where: { id: existing.id },
            data: { stageId: potential.id, lastInteractionAt: now },
          });
          await tx.stageHistory.create({
            data: {
              leadId: existing.id,
              fromStageId: existing.stageId,
              toStageId: potential.id,
              notes: "Auto-promovido: lead respondeu via Chatwoot",
            },
          });
          await appendLeadNote(
            {
              tenantId,
              leadId: existing.id,
              kind: "STAGE_CHANGED",
              body: `Movido de "Novo Lead" → "Potencial" (auto, resposta do lead)`,
              metadata: {
                fromStageName: "Novo Lead",
                toStageName: "Potencial",
                automatic: true,
              },
            },
            tx,
          );
        });
        movedToPotential = true;
      }
    }

    // Se não auto-moveu, só atualiza lastInteractionAt (a transação acima já
    // cuida disso quando move).
    if (!movedToPotential) {
      await prisma.lead.update({
        where: { id: existing.id },
        data: { lastInteractionAt: now },
      });
    }

    // Tag "Nova resposta" — alerta visual no card. Some quando o agente
    // responde via Chatwoot (branch outgoing acima) ou quando alguém remove
    // manualmente no editor de tags.
    if (!existing.tags.includes(NEW_REPLY_TAG)) {
      await prisma.lead.update({
        where: { id: existing.id },
        data: { tags: [...existing.tags, NEW_REPLY_TAG] },
      });
    }

    // Registra no diário.
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

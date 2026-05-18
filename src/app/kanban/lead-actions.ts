"use server";

import { LeadOrigin } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { appendLeadNote, listLeadNotes, type LeadNoteFilter, type LeadNoteRow } from "@/server/lead-notes";
import { findLeadInScope, scopedLeadWhere } from "@/server/leads";
import { enqueueWelcomeSequence, pauseLeadJobs } from "@/server/messaging";
import { getLeadFollowUpStatus, type FollowUpStatus } from "@/server/messaging/status";
import { requireTenantUser } from "@/server/tenant";

// ──────────────────────────────────────────────────────────────────────────
// Read
// ──────────────────────────────────────────────────────────────────────────

export type LeadDetails = NonNullable<Awaited<ReturnType<typeof getLeadDetails>>>;

/**
 * Carrega o detalhe de UM lead (pra preencher o sheet).
 * Retorna null se o user não tem permissão (SELLER tentando ver lead alheio).
 */
export async function getLeadDetails(leadId: string) {
  const { tenant, membership } = await requireTenantUser();

  return prisma.lead.findFirst({
    where: { id: leadId, ...scopedLeadWhere(membership) },
    select: {
      id: true,
      tenantId: true,
      name: true,
      phone: true,
      email: true,
      origin: true,
      stageId: true,
      modalityId: true,
      assignedSellerId: true,
      notes: true,
      tags: true,
      potentialValue: true,
      followUpEnabled: true,
      chatwootConversationId: true,
      chatwootContactId: true,
      firstInteractionAt: true,
      lastInteractionAt: true,
      modality: { select: { id: true, name: true } },
      stage: { select: { id: true, name: true, color: true } },
      assignedSeller: { select: { id: true, name: true, email: true } },
      enrollment: {
        select: {
          id: true,
          status: true,
          enrolledAt: true,
          canceledAt: true,
          suspendedAt: true,
          suspensionReason: true,
          expectedReturnAt: true,
          monthlyValue: true,
          modality: { select: { id: true, name: true } },
          plan: { select: { id: true, name: true } },
        },
      },
      history: {
        orderBy: { changedAt: "desc" },
        take: 50,
        select: {
          id: true,
          changedAt: true,
          notes: true,
          fromStageId: true,
          toStageId: true,
          changedBy: { select: { id: true, name: true, email: true } },
          toStage: { select: { id: true, name: true, color: true } },
        },
      },
    },
  }).then((lead) => (lead ? { ...lead, _tenantSlug: tenant.slug } : null));
}

// ──────────────────────────────────────────────────────────────────────────
// Update lead info (qualquer membership pode editar leads do seu scope)
// ──────────────────────────────────────────────────────────────────────────

const updateInfoSchema = z.object({
  leadId: z.string().min(1),
  name: z.string().min(1).max(200),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().max(200).nullable().or(z.literal("")).optional(),
  notes: z.string().max(5000).nullable().optional(),
});

type ActionResult<T = void> =
  | (T extends void ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string };

export async function updateLeadInfo(input: unknown): Promise<ActionResult> {
  const parsed = updateInfoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { membership } = await requireTenantUser();
  const lead = await findLeadInScope(membership, parsed.data.leadId);
  if (!lead) return { ok: false, error: "lead não encontrado ou sem permissão" };

  await prisma.lead.update({
    where: { id: lead.id },
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ? parsed.data.email : null,
      notes: parsed.data.notes ?? null,
    },
  });

  revalidatePath("/kanban");
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Assign seller (v1.1-O: qualquer role do tenant pode reatribuir)
// ──────────────────────────────────────────────────────────────────────────

const assignSchema = z.object({
  leadId: z.string().min(1),
  sellerId: z.string().min(1).nullable(),
});

export async function assignSeller(input: unknown): Promise<ActionResult> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, membership } = await requireTenantUser();

  const lead = await findLeadInScope(membership, parsed.data.leadId);
  if (!lead) return { ok: false, error: "lead não encontrado" };

  // Se for atribuir a alguém, valida que essa pessoa é membro ativo do tenant
  if (parsed.data.sellerId) {
    const member = await prisma.tenantUser.findUnique({
      where: {
        tenantId_userId: { tenantId: tenant.id, userId: parsed.data.sellerId },
      },
    });
    if (!member?.active) {
      return { ok: false, error: "vendedor inválido ou inativo" };
    }
  }

  await prisma.lead.update({
    where: { id: lead.id },
    data: { assignedSellerId: parsed.data.sellerId },
  });

  revalidatePath("/kanban");
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Set modality
// ──────────────────────────────────────────────────────────────────────────

const setModalitySchema = z.object({
  leadId: z.string().min(1),
  modalityId: z.string().min(1).nullable(),
});

// ──────────────────────────────────────────────────────────────────────────
// Tags acumulativas (v1.1)
// ──────────────────────────────────────────────────────────────────────────

const setTagsSchema = z.object({
  leadId: z.string().min(1),
  tags: z.array(z.string().min(1).max(50)).max(20),
});

export async function setLeadTags(input: unknown): Promise<ActionResult> {
  const parsed = setTagsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { membership } = await requireTenantUser();
  const lead = await findLeadInScope(membership, parsed.data.leadId);
  if (!lead) return { ok: false, error: "lead não encontrado ou sem permissão" };

  // Deduplicate + trim (defesa contra UI buggada)
  const cleanedTags = Array.from(
    new Set(parsed.data.tags.map((t) => t.trim()).filter(Boolean)),
  );

  await prisma.lead.update({
    where: { id: lead.id },
    data: { tags: cleanedTags },
  });

  revalidatePath("/kanban");
  return { ok: true };
}

export async function setModality(input: unknown): Promise<ActionResult> {
  const parsed = setModalitySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, membership } = await requireTenantUser();
  const lead = await findLeadInScope(membership, parsed.data.leadId);
  if (!lead) return { ok: false, error: "lead não encontrado ou sem permissão" };

  if (parsed.data.modalityId) {
    const modality = await prisma.modality.findFirst({
      where: { id: parsed.data.modalityId, tenantId: tenant.id, active: true },
      select: { id: true },
    });
    if (!modality) return { ok: false, error: "modalidade inválida" };
  }

  await prisma.lead.update({
    where: { id: lead.id },
    data: { modalityId: parsed.data.modalityId },
  });

  revalidatePath("/kanban");
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Follow-up: toggle por lead + leitura da timeline
// ──────────────────────────────────────────────────────────────────────────

const toggleFollowUpSchema = z.object({
  leadId: z.string().min(1),
  enabled: z.boolean(),
});

/**
 * Liga/desliga a cadência automática neste lead.
 *
 * Ao desligar, marca todos os PENDING como SKIPPED (motivo:
 * "desligado manualmente"). Isso impede que o cron próximo dispare M3, M4,
 * etc. mesmo que o tenant inteiro esteja ligado.
 *
 * Ao religar, NÃO recria jobs automaticamente — o atendente pode usar o
 * card pra forçar uma sequência se quiser. A regra é: desligar é defensivo
 * (não derruba histórico já SENT), religar volta ao default (cadências
 * futuras passam a ser permitidas).
 */
export async function toggleLeadFollowUp(input: unknown): Promise<ActionResult> {
  const parsed = toggleFollowUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();
  const lead = await findLeadInScope(membership, parsed.data.leadId);
  if (!lead) return { ok: false, error: "lead não encontrado ou sem permissão" };

  await prisma.lead.update({
    where: { id: lead.id },
    data: { followUpEnabled: parsed.data.enabled },
  });

  if (!parsed.data.enabled) {
    await pauseLeadJobs(lead.id, "follow-up desligado manualmente no lead");
  }

  await appendLeadNote({
    tenantId: tenant.id,
    leadId: lead.id,
    authorId: user.id,
    kind: parsed.data.enabled ? "FOLLOWUP_RESUMED" : "FOLLOWUP_PAUSED",
    body: parsed.data.enabled
      ? "Follow-up automático reativado"
      : "Follow-up automático pausado neste lead",
  });

  revalidatePath("/kanban");
  return { ok: true };
}

export async function getLeadFollowUp(leadId: string): Promise<FollowUpStatus | null> {
  const { membership } = await requireTenantUser();
  const lead = await findLeadInScope(membership, leadId);
  if (!lead) return null;
  return getLeadFollowUpStatus(leadId);
}

// ──────────────────────────────────────────────────────────────────────────
// Diário do lead (LeadNote)
// ──────────────────────────────────────────────────────────────────────────

const addNoteSchema = z.object({
  leadId: z.string().min(1),
  body: z.string().min(1).max(5000),
});

export async function addLeadNote(input: unknown): Promise<ActionResult> {
  const parsed = addNoteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();
  const lead = await findLeadInScope(membership, parsed.data.leadId);
  if (!lead) return { ok: false, error: "lead não encontrado ou sem permissão" };

  await appendLeadNote({
    tenantId: tenant.id,
    leadId: lead.id,
    authorId: user.id,
    kind: "MANUAL",
    body: parsed.data.body.trim(),
  });

  revalidatePath("/kanban");
  return { ok: true };
}

export async function getLeadNotes(
  leadId: string,
  filter: LeadNoteFilter = "all",
): Promise<LeadNoteRow[] | null> {
  const { membership } = await requireTenantUser();
  return listLeadNotes(membership, leadId, filter);
}

// ──────────────────────────────────────────────────────────────────────────
// Origem do lead (campo livre, editável depois do cadastro)
// ──────────────────────────────────────────────────────────────────────────

const setOriginSchema = z.object({
  leadId: z.string().min(1),
  origin: z.enum(LeadOrigin),
});

export async function setLeadOrigin(input: unknown): Promise<ActionResult> {
  const parsed = setOriginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { membership } = await requireTenantUser();
  const lead = await findLeadInScope(membership, parsed.data.leadId);
  if (!lead) return { ok: false, error: "lead não encontrado ou sem permissão" };

  await prisma.lead.update({
    where: { id: lead.id },
    data: { origin: parsed.data.origin },
  });

  revalidatePath("/kanban");
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Criar lead manualmente (walk-in, indicação no balcão, lead que não passou
// pelo Chatwoot, etc).
// ──────────────────────────────────────────────────────────────────────────

const createLeadSchema = z.object({
  name: z.string().min(1).max(200),
  phone: z.string().max(50).nullable().optional(),
  email: z.string().email().max(200).nullable().or(z.literal("")).optional(),
  origin: z.enum(LeadOrigin),
  modalityId: z.string().min(1).nullable().optional(),
  assignedSellerId: z.string().min(1).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export type CreateLeadResult =
  | { ok: true; leadId: string; welcomeEnqueued: boolean }
  | { ok: false; error: string };

export async function createManualLead(input: unknown): Promise<CreateLeadResult> {
  const parsed = createLeadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, membership } = await requireTenantUser();

  // Validações de FK dentro do tenant (defesa contra IDs forjados).
  if (parsed.data.modalityId) {
    const m = await prisma.modality.findFirst({
      where: { id: parsed.data.modalityId, tenantId: tenant.id, active: true },
      select: { id: true },
    });
    if (!m) return { ok: false, error: "modalidade inválida" };
  }
  if (parsed.data.assignedSellerId) {
    const member = await prisma.tenantUser.findUnique({
      where: {
        tenantId_userId: { tenantId: tenant.id, userId: parsed.data.assignedSellerId },
      },
    });
    if (!member?.active) return { ok: false, error: "vendedor inválido ou inativo" };
  }

  // Stage inicial = primeiro stage ativo por order ASC (mesma lógica do
  // webhook do Chatwoot — ver handlers.ts:getInitialStageId).
  const initialStage = await prisma.stage.findFirst({
    where: { tenantId: tenant.id, active: true },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  if (!initialStage) {
    return {
      ok: false,
      error: "tenant sem stages configurados — rode db:seed ou crie em /settings/estagios",
    };
  }

  const now = new Date();
  const lead = await prisma.$transaction(async (tx) => {
    const created = await tx.lead.create({
      data: {
        tenantId: tenant.id,
        stageId: initialStage.id,
        name: parsed.data.name,
        phone: parsed.data.phone || null,
        email: parsed.data.email || null,
        origin: parsed.data.origin,
        modalityId: parsed.data.modalityId || null,
        assignedSellerId: parsed.data.assignedSellerId || null,
        notes: parsed.data.notes || null,
        firstInteractionAt: now,
        lastInteractionAt: now,
      },
    });
    await tx.stageHistory.create({
      data: {
        leadId: created.id,
        toStageId: initialStage.id,
        changedById: membership.userId,
        notes: "Lead criado manualmente",
      },
    });
    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId: created.id,
        authorId: membership.userId,
        kind: "LEAD_CREATED",
        body: `Lead criado manualmente — origem: ${parsed.data.origin.toLowerCase()}`,
        metadata: { origin: parsed.data.origin },
      },
      tx,
    );
    return created;
  });

  // Enfileira welcome se tiver telefone — mesma regra do Chatwoot. Isolado
  // em try/catch pra não derrubar a UI se Wuzapi/schedule falhar.
  let welcomeEnqueued = false;
  if (lead.phone) {
    try {
      const result = await enqueueWelcomeSequence(lead.id, now);
      welcomeEnqueued = result.kind === "created";
    } catch (err) {
      console.error("[createManualLead] enqueueWelcomeSequence falhou", err);
    }
  }

  revalidatePath("/kanban");
  return { ok: true, leadId: lead.id, welcomeEnqueued };
}

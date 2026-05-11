"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { findLeadInScope, scopedLeadWhere } from "@/server/leads";
import { roleAtLeast } from "@/server/rbac";
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
// Assign seller (só ADMIN/MANAGER pode reatribuir)
// ──────────────────────────────────────────────────────────────────────────

const assignSchema = z.object({
  leadId: z.string().min(1),
  sellerId: z.string().min(1).nullable(),
});

export async function assignSeller(input: unknown): Promise<ActionResult> {
  const parsed = assignSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, membership } = await requireTenantUser();
  if (!roleAtLeast(membership.role, "MANAGER")) {
    return { ok: false, error: "apenas managers/admins podem reatribuir leads" };
  }

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

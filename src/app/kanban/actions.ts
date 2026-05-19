"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { appendLeadNote } from "@/server/lead-notes";
import { findLeadInScope } from "@/server/leads";
import { requireTenantUser } from "@/server/tenant";

const moveSchema = z.object({
  leadId: z.string().min(1),
  toStageId: z.string().min(1),
});

export type MoveResult =
  | { ok: true; leadId: string; fromStageId: string; toStageId: string }
  | { ok: false; error: string };

/**
 * Move um lead pra outro stage. Cria um StageHistory pra timeline.
 *
 * Autorização (em ordem):
 *   1. requireTenantUser → user logado + membership ativa no tenant atual
 *   2. findLeadInScope   → SELLER só consegue mover leads atribuídos a si
 *   3. stage destino     → tem que pertencer ao MESMO tenant
 *
 * Idempotência: mover pro mesmo stage atual é no-op (não cria histórico).
 */
export async function moveLeadToStage(input: unknown): Promise<MoveResult> {
  const parsed = moveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { leadId, toStageId } = parsed.data;
  const { tenant, user, membership } = await requireTenantUser();

  const lead = await findLeadInScope(membership, leadId);
  if (!lead) return { ok: false, error: "lead não encontrado ou sem permissão" };

  if (lead.stageId === toStageId) {
    return { ok: true, leadId, fromStageId: lead.stageId, toStageId };
  }

  // Garante que stage destino é do MESMO tenant. Sem isso, um ADMIN da
  // Gracie poderia mover lead pra um stageId de outro tenant via tampering.
  const stage = await prisma.stage.findFirst({
    where: { id: toStageId, tenantId: tenant.id, active: true },
    select: { id: true, name: true },
  });
  if (!stage) return { ok: false, error: "stage de destino inválido" };

  // Pra montar o body do note "X → Y" precisamos do nome do stage origem.
  const fromStage = await prisma.stage.findUnique({
    where: { id: lead.stageId },
    select: { name: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: leadId },
      data: { stageId: toStageId, lastInteractionAt: new Date() },
    });
    await tx.stageHistory.create({
      data: {
        leadId,
        fromStageId: lead.stageId,
        toStageId,
        changedById: user.id,
      },
    });
    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId,
        authorId: user.id,
        kind: "STAGE_CHANGED",
        body: `Movido de "${fromStage?.name ?? "?"}" → "${stage.name}"`,
        metadata: { fromStageId: lead.stageId, toStageId, fromStageName: fromStage?.name ?? null, toStageName: stage.name },
      },
      tx,
    );
  });

  revalidatePath("/kanban");
  return { ok: true, leadId, fromStageId: lead.stageId, toStageId };
}

// ──────────────────────────────────────────────────────────────────────────
// v1.1-Z: drag pra stage isLost com motivo obrigatório
// ──────────────────────────────────────────────────────────────────────────

const moveToLostSchema = z.object({
  leadId: z.string().min(1),
  toStageId: z.string().min(1),
  reason: z.string().min(3).max(2000),
});

/**
 * Move o lead pra um stage isLost registrando o motivo da perda no diário.
 * Diferente de `moveLeadToStage`: exige motivo, adiciona tag "Perdido" e
 * pausa cadência de follow-up (não faz sentido continuar mandando welcome
 * pra um lead marcado como perdido).
 */
export async function moveLeadToLost(input: unknown): Promise<MoveResult> {
  const parsed = moveToLostSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "informe o motivo (mínimo 3 caracteres)" };
  }

  const { leadId, toStageId, reason } = parsed.data;
  const { tenant, user, membership } = await requireTenantUser();

  const lead = await findLeadInScope(membership, leadId);
  if (!lead) return { ok: false, error: "lead não encontrado ou sem permissão" };

  const stage = await prisma.stage.findFirst({
    where: { id: toStageId, tenantId: tenant.id, active: true, isLost: true },
    select: { id: true, name: true },
  });
  if (!stage) {
    return { ok: false, error: "stage de destino inválido (não é estágio de perda)" };
  }

  const fromStage = await prisma.stage.findUnique({
    where: { id: lead.stageId },
    select: { name: true },
  });
  const cleanReason = reason.trim();
  const PERDIDO_TAG = "Perdido";

  await prisma.$transaction(async (tx) => {
    const current = await tx.lead.findUnique({
      where: { id: leadId },
      select: { tags: true },
    });
    const nextTags =
      current && !current.tags.includes(PERDIDO_TAG)
        ? [...current.tags, PERDIDO_TAG]
        : current?.tags ?? [];

    await tx.lead.update({
      where: { id: leadId },
      data: {
        stageId: toStageId,
        lastInteractionAt: new Date(),
        tags: nextTags,
      },
    });
    await tx.stageHistory.create({
      data: {
        leadId,
        fromStageId: lead.stageId,
        toStageId,
        changedById: user.id,
        notes: `Perda — ${cleanReason}`,
      },
    });
    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId,
        authorId: user.id,
        kind: "STAGE_CHANGED",
        body: `Movido de "${fromStage?.name ?? "?"}" → "${stage.name}" — motivo: ${cleanReason}`,
        metadata: {
          fromStageId: lead.stageId,
          toStageId,
          fromStageName: fromStage?.name ?? null,
          toStageName: stage.name,
          lossReason: cleanReason,
        },
      },
      tx,
    );
  });

  // Pausa cadência — lead "perdido" não deve continuar recebendo welcome
  // automático. Pausa só welcome (cadência); transacionais ficam.
  try {
    const { pauseLeadJobs } = await import("@/server/messaging");
    await pauseLeadJobs(leadId, `lead movido pra perda: ${cleanReason}`, {
      kind: "welcome",
    });
  } catch (err) {
    console.error("[moveLeadToLost] pauseLeadJobs falhou", err);
  }

  revalidatePath("/kanban");
  return { ok: true, leadId, fromStageId: lead.stageId, toStageId };
}

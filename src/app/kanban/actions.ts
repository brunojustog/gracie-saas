"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
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
    select: { id: true },
  });
  if (!stage) return { ok: false, error: "stage de destino inválido" };

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
  });

  revalidatePath("/kanban");
  return { ok: true, leadId, fromStageId: lead.stageId, toStageId };
}

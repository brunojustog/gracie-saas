"use server";

/**
 * Lixeira de leads excluídos (v1.1-W).
 *
 * Restaurar volta o lead pro kanban: limpa deletedAt/deletedById/deletionReason
 * e registra LeadNote LEAD_RESTORED. ADMIN-only (mesmo escopo da página).
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { appendLeadNote } from "@/server/lead-notes";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

const restoreSchema = z.object({ leadId: z.string().min(1) });

export async function restoreLead(input: unknown): Promise<Result> {
  const parsed = restoreSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user } = await requireRole("ADMIN");

  // Não usa findLeadInScope (que filtra deletados). Busca direto incluindo
  // deletados, e valida o tenant manualmente.
  const lead = await prisma.lead.findFirst({
    where: {
      id: parsed.data.leadId,
      tenantId: tenant.id,
      deletedAt: { not: null },
    },
    select: { id: true },
  });
  if (!lead) {
    return { ok: false, error: "lead não encontrado na lixeira" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        deletedAt: null,
        deletedById: null,
        deletionReason: null,
      },
    });
    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId: lead.id,
        authorId: user.id,
        kind: "LEAD_RESTORED",
        body: "Lead restaurado da lixeira",
      },
      tx,
    );
  });

  revalidatePath("/settings/lixeira");
  revalidatePath("/kanban");
  return { ok: true };
}

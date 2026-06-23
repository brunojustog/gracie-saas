"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { parseLocalDate } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { appendLeadNote } from "@/server/lead-notes";
import { findLeadInScope } from "@/server/leads";
import { findLooseClassInScope } from "@/server/loose-classes";
import { requireTenantUser } from "@/server/tenant";

type Result = { ok: true; id: string } | { ok: false; error: string };

const AVULSO_TAG = "Avulso";
const AVULSO_STAGE = "Aula Avulsa";
const PAYMENT = ["CREDIT_CARD", "PIX", "BOLETO", "CASH", "TRANSFER", "OTHER"] as const;

export async function getLooseFormOptions() {
  const { tenant } = await requireTenantUser();
  const [modalities, leads, sellers] = await Promise.all([
    prisma.modality.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.lead.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    }),
    prisma.tenantUser.findMany({
      where: { tenantId: tenant.id, role: "SELLER", active: true },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    modalities,
    leads,
    sellers: sellers.map((s) => ({
      id: s.user.id,
      name: s.user.name ?? s.user.email,
    })),
  };
}

const createSchema = z.object({
  leadId: z.string().min(1),
  modalityId: z.string().min(1).nullable().optional(),
  value: z.number().nonnegative().max(1_000_000),
  classDate: z.string().date(),
  paymentMethod: z.enum(PAYMENT).nullable().optional(),
  soldById: z.string().min(1).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function createLooseClass(input: unknown): Promise<Result> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();
  const lead = await findLeadInScope(membership, parsed.data.leadId);
  if (!lead) return { ok: false, error: "lead não encontrado ou sem permissão" };

  if (parsed.data.modalityId) {
    const m = await prisma.modality.findFirst({
      where: { id: parsed.data.modalityId, tenantId: tenant.id },
      select: { id: true },
    });
    if (!m) return { ok: false, error: "modalidade inválida" };
  }

  const created = await prisma.$transaction(async (tx) => {
    const loose = await tx.looseClass.create({
      data: {
        tenantId: tenant.id,
        leadId: lead.id,
        modalityId: parsed.data.modalityId ?? null,
        value: parsed.data.value,
        classDate: parseLocalDate(parsed.data.classDate)!,
        paymentMethod: parsed.data.paymentMethod ?? null,
        soldById: parsed.data.soldById ?? null,
        notes: parsed.data.notes ?? null,
      },
    });

    // Tag "Avulso" no lead (sem duplicar).
    const cur = await tx.lead.findUnique({
      where: { id: lead.id },
      select: { tags: true, stageId: true },
    });
    if (cur && !cur.tags.includes(AVULSO_TAG)) {
      await tx.lead.update({
        where: { id: lead.id },
        data: { tags: [...cur.tags, AVULSO_TAG], lastInteractionAt: new Date() },
      });
    }

    // Move pro estágio terminal "Aula Avulsa" (fora do funil), se existir.
    const stage = await tx.stage.findFirst({
      where: { tenantId: tenant.id, name: AVULSO_STAGE, active: true },
      select: { id: true },
    });
    if (stage && cur && cur.stageId !== stage.id) {
      await tx.lead.update({
        where: { id: lead.id },
        data: { stageId: stage.id, lastInteractionAt: new Date() },
      });
      await tx.stageHistory.create({
        data: {
          leadId: lead.id,
          fromStageId: cur.stageId,
          toStageId: stage.id,
          changedById: user.id,
          notes: "Movido para Aula Avulsa",
        },
      });
    }

    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId: lead.id,
        authorId: user.id,
        kind: "MANUAL",
        body: "Aula avulsa registrada",
        metadata: { looseClassId: loose.id },
      },
      tx,
    );
    return loose;
  });

  revalidatePath("/avulsas");
  revalidatePath("/kanban");
  revalidatePath("/quadro");
  return { ok: true, id: created.id };
}

export async function deleteLooseClass(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { membership } = await requireTenantUser();
  const loose = await findLooseClassInScope(membership, parsed.data.id);
  if (!loose) return { ok: false, error: "aula avulsa não encontrada" };

  await prisma.looseClass.delete({ where: { id: loose.id } });
  revalidatePath("/avulsas");
  revalidatePath("/quadro");
  return { ok: true, id: loose.id };
}

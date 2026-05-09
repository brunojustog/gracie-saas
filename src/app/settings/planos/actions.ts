"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

const planSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  monthlyValue: z.number().positive().max(100_000),
  setupFee: z.number().nonnegative().max(100_000).nullable().optional(),
  modalityId: z.string().nullable().optional(),
  active: z.boolean().default(true),
});

export async function upsertPlan(input: unknown): Promise<Result> {
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  // Modality (se setada) tem que ser do tenant
  if (parsed.data.modalityId) {
    const m = await prisma.modality.findFirst({
      where: { id: parsed.data.modalityId, tenantId: tenant.id },
      select: { id: true },
    });
    if (!m) return { ok: false, error: "modalidade inválida" };
  }

  if (parsed.data.id) {
    const target = await prisma.plan.findFirst({
      where: { id: parsed.data.id, tenantId: tenant.id },
    });
    if (!target) return { ok: false, error: "plano não encontrado" };
    await prisma.plan.update({
      where: { id: target.id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        monthlyValue: parsed.data.monthlyValue,
        setupFee: parsed.data.setupFee ?? null,
        modalityId: parsed.data.modalityId ?? null,
        active: parsed.data.active,
      },
    });
  } else {
    await prisma.plan.create({
      data: {
        tenantId: tenant.id,
        name: parsed.data.name,
        description: parsed.data.description ?? null,
        monthlyValue: parsed.data.monthlyValue,
        setupFee: parsed.data.setupFee ?? null,
        modalityId: parsed.data.modalityId ?? null,
      },
    });
  }
  revalidatePath("/settings/planos");
  revalidatePath("/matriculas");
  return { ok: true };
}

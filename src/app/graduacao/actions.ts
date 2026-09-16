"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { validSlotSet } from "@/server/graduation-exams";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

const bookSchema = z.object({
  scheduledAt: z.string().min(1),
  alunoId: z.string().min(1),
  targetBelt: z.string().max(40).optional().nullable(),
  targetBeltDegree: z.number().int().min(0).max(6).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function bookExam(input: unknown): Promise<Result> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant, user } = await requireRole("SELLER");
  const d = parsed.data;

  const at = new Date(d.scheduledAt);
  if (Number.isNaN(at.getTime())) return { ok: false, error: "horário inválido" };
  // Só aceita um dos horários fixos da janela.
  if (!validSlotSet().has(at.toISOString())) {
    return { ok: false, error: "horário fora da grade de provas" };
  }

  const aluno = await prisma.aluno.findFirst({
    where: { id: d.alunoId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!aluno) return { ok: false, error: "aluno não encontrado" };

  try {
    await prisma.graduationExam.create({
      data: {
        tenantId: tenant.id,
        alunoId: aluno.id,
        scheduledAt: at,
        targetBelt: d.targetBelt?.trim() || null,
        targetBeltDegree: d.targetBeltDegree ?? null,
        notes: d.notes?.trim() || null,
        createdById: user.id,
      },
    });
  } catch {
    // unique (tenantId, scheduledAt) — corrida: alguém pegou o horário.
    return { ok: false, error: "esse horário acabou de ser ocupado" };
  }

  revalidatePath("/graduacao");
  revalidatePath("/professor/provas");
  return { ok: true };
}

export async function cancelExam(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("SELLER");

  const exam = await prisma.graduationExam.findFirst({
    where: { id: parsed.data.id, tenantId: tenant.id },
    select: { id: true },
  });
  if (!exam) return { ok: false, error: "agendamento não encontrado" };

  // Apaga pra liberar o horário (unique por slot).
  await prisma.graduationExam.delete({ where: { id: exam.id } });

  revalidatePath("/graduacao");
  revalidatePath("/professor/provas");
  return { ok: true };
}

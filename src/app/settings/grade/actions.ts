"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

const slotSchema = z.object({
  professorId: z.string().min(1),
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "hora inválida (HH:MM)"),
  label: z.string().min(1).max(40),
  isKids: z.boolean().default(false),
  value: z.number().nonnegative().max(100000).default(70),
});

async function assertProfessor(tenantId: string, professorId: string) {
  const p = await prisma.professor.findFirst({
    where: { id: professorId, tenantId },
    select: { id: true },
  });
  return !!p;
}

export async function createGridSlot(input: unknown): Promise<Result> {
  const parsed = slotSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "input inválido" };
  }
  const { tenant } = await requireRole("ADMIN");
  if (!(await assertProfessor(tenant.id, parsed.data.professorId))) {
    return { ok: false, error: "professor inválido" };
  }
  await prisma.classGridSlot.create({
    data: {
      tenantId: tenant.id,
      professorId: parsed.data.professorId,
      dayOfWeek: parsed.data.dayOfWeek,
      startTime: parsed.data.startTime,
      label: parsed.data.label.trim(),
      isKids: parsed.data.isKids,
      value: parsed.data.value,
    },
  });
  revalidatePath("/settings/grade");
  revalidatePath("/professor");
  return { ok: true };
}

const updateSchema = slotSchema.extend({
  id: z.string().min(1),
  active: z.boolean(),
});

export async function updateGridSlot(input: unknown): Promise<Result> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "input inválido" };
  }
  const { tenant } = await requireRole("ADMIN");
  const target = await prisma.classGridSlot.findFirst({
    where: { id: parsed.data.id, tenantId: tenant.id },
    select: { id: true },
  });
  if (!target) return { ok: false, error: "aula da grade não encontrada" };
  if (!(await assertProfessor(tenant.id, parsed.data.professorId))) {
    return { ok: false, error: "professor inválido" };
  }
  await prisma.classGridSlot.update({
    where: { id: target.id },
    data: {
      professorId: parsed.data.professorId,
      dayOfWeek: parsed.data.dayOfWeek,
      startTime: parsed.data.startTime,
      label: parsed.data.label.trim(),
      isKids: parsed.data.isKids,
      value: parsed.data.value,
      active: parsed.data.active,
    },
  });
  revalidatePath("/settings/grade");
  revalidatePath("/professor");
  return { ok: true };
}

export async function deleteGridSlot(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");
  const target = await prisma.classGridSlot.findFirst({
    where: { id: parsed.data.id, tenantId: tenant.id },
    select: { id: true },
  });
  if (!target) return { ok: false, error: "aula da grade não encontrada" };
  // Preserva aulas já dadas (TaughtClass) — o FK é SET NULL, então o histórico fica.
  await prisma.classGridSlot.delete({ where: { id: target.id } });
  revalidatePath("/settings/grade");
  revalidatePath("/professor");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireProfessor } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

/** Carrega o professor logado. Erro se o usuário não estiver vinculado. */
async function currentProfessor(): Promise<
  | { ok: true; tenantId: string; professorId: string }
  | { ok: false; error: string }
> {
  const { tenant, professor } = await requireProfessor();
  if (!professor) {
    return { ok: false, error: "seu usuário não está vinculado a um professor" };
  }
  return { ok: true, tenantId: tenant.id, professorId: professor.id };
}

const confirmSchema = z.object({
  slotId: z.string().min(1),
  date: z.string().date(),
  auxProfessorId: z.string().min(1).nullable().optional(),
});

/** Confirma uma aula da MINHA grade (check "dei a aula"). KIDS exige auxiliar. */
export async function confirmGridClass(input: unknown): Promise<Result> {
  const parsed = confirmSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const ctx = await currentProfessor();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const slot = await prisma.classGridSlot.findFirst({
    where: { id: parsed.data.slotId, tenantId: ctx.tenantId, professorId: ctx.professorId },
  });
  if (!slot) return { ok: false, error: "aula não encontrada na sua grade" };

  const date = new Date(`${parsed.data.date}T00:00:00`);

  if (slot.isKids && !parsed.data.auxProfessorId) {
    return { ok: false, error: "aula KIDS: selecione o professor auxiliar" };
  }
  let auxProfessorId: string | null = null;
  if (slot.isKids && parsed.data.auxProfessorId) {
    const aux = await prisma.professor.findFirst({
      where: { id: parsed.data.auxProfessorId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!aux) return { ok: false, error: "auxiliar inválido" };
    if (aux.id === ctx.professorId) {
      return { ok: false, error: "o auxiliar precisa ser outro professor" };
    }
    auxProfessorId = aux.id;
  }

  const existing = await prisma.taughtClass.findUnique({
    where: { gridSlotId_date: { gridSlotId: slot.id, date } },
    select: { id: true },
  });
  if (existing) return { ok: false, error: "essa aula já foi registrada" };

  await prisma.taughtClass.create({
    data: {
      tenantId: ctx.tenantId,
      professorId: ctx.professorId,
      titularProfessorId: ctx.professorId,
      auxProfessorId,
      gridSlotId: slot.id,
      date,
      startTime: slot.startTime,
      label: slot.label,
      isKids: slot.isKids,
      value: slot.value,
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
  });
  revalidatePath("/professor");
  return { ok: true };
}

/** Desfaz uma confirmação minha (ex.: cliquei errado). */
export async function unconfirmClass(input: unknown): Promise<Result> {
  const parsed = z.object({ taughtId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const ctx = await currentProfessor();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const t = await prisma.taughtClass.findFirst({
    where: { id: parsed.data.taughtId, tenantId: ctx.tenantId, professorId: ctx.professorId },
    select: { id: true },
  });
  if (!t) return { ok: false, error: "aula não encontrada" };
  await prisma.taughtClass.delete({ where: { id: t.id } });
  revalidatePath("/professor");
  return { ok: true };
}

const transferSchema = z.object({
  slotId: z.string().min(1),
  date: z.string().date(),
  toProfessorId: z.string().min(1),
});

/** Transfere uma aula da minha grade pra outro professor (ele confirma depois). */
export async function transferGridClass(input: unknown): Promise<Result> {
  const parsed = transferSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const ctx = await currentProfessor();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const slot = await prisma.classGridSlot.findFirst({
    where: { id: parsed.data.slotId, tenantId: ctx.tenantId, professorId: ctx.professorId },
  });
  if (!slot) return { ok: false, error: "aula não encontrada na sua grade" };
  if (parsed.data.toProfessorId === ctx.professorId) {
    return { ok: false, error: "transfira pra outro professor" };
  }
  const to = await prisma.professor.findFirst({
    where: { id: parsed.data.toProfessorId, tenantId: ctx.tenantId, active: true },
    select: { id: true },
  });
  if (!to) return { ok: false, error: "professor destino inválido" };

  const date = new Date(`${parsed.data.date}T00:00:00`);
  // Upsert no slot/dia: passa a responsabilidade pro outro professor (PENDING).
  await prisma.taughtClass.upsert({
    where: { gridSlotId_date: { gridSlotId: slot.id, date } },
    create: {
      tenantId: ctx.tenantId,
      professorId: to.id,
      titularProfessorId: ctx.professorId,
      gridSlotId: slot.id,
      date,
      startTime: slot.startTime,
      label: slot.label,
      isKids: slot.isKids,
      value: slot.value,
      status: "PENDING",
    },
    update: {
      professorId: to.id,
      titularProfessorId: ctx.professorId,
      status: "PENDING",
      confirmedAt: null,
      auxProfessorId: null,
    },
  });
  revalidatePath("/professor");
  return { ok: true };
}

const confirmIncomingSchema = z.object({
  taughtId: z.string().min(1),
  auxProfessorId: z.string().min(1).nullable().optional(),
});

/** Confirma uma aula transferida PRA MIM. */
export async function confirmIncoming(input: unknown): Promise<Result> {
  const parsed = confirmIncomingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const ctx = await currentProfessor();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const t = await prisma.taughtClass.findFirst({
    where: { id: parsed.data.taughtId, tenantId: ctx.tenantId, professorId: ctx.professorId },
  });
  if (!t) return { ok: false, error: "aula não encontrada" };
  if (t.isKids && !parsed.data.auxProfessorId) {
    return { ok: false, error: "aula KIDS: selecione o professor auxiliar" };
  }
  let auxProfessorId: string | null = t.auxProfessorId;
  if (t.isKids && parsed.data.auxProfessorId) {
    const aux = await prisma.professor.findFirst({
      where: { id: parsed.data.auxProfessorId, tenantId: ctx.tenantId },
      select: { id: true },
    });
    if (!aux) return { ok: false, error: "auxiliar inválido" };
    auxProfessorId = aux.id;
  }
  await prisma.taughtClass.update({
    where: { id: t.id },
    data: { status: "CONFIRMED", confirmedAt: new Date(), auxProfessorId },
  });
  revalidatePath("/professor");
  return { ok: true };
}

/** Confirma uma aula PARTICULAR atribuída a mim (marca concluída). */
export async function confirmParticularSession(input: unknown): Promise<Result> {
  const parsed = z.object({ sessionId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const ctx = await currentProfessor();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const s = await prisma.privateSession.findFirst({
    where: {
      id: parsed.data.sessionId,
      professorId: ctx.professorId,
      package: { tenantId: ctx.tenantId },
    },
    select: { id: true },
  });
  if (!s) return { ok: false, error: "aula particular não encontrada" };
  await prisma.privateSession.update({
    where: { id: s.id },
    data: { completedAt: new Date() },
  });
  revalidatePath("/professor");
  revalidatePath("/quadro");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { roleAtLeast } from "@/server/rbac";
import { requireProfessor } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

/** Contexto do professor logado + se é admin (vê/edita qualquer aula). */
async function ctx(): Promise<
  | { ok: true; tenantId: string; professorId: string | null; isAdmin: boolean }
  | { ok: false; error: string }
> {
  const { tenant, membership, professor } = await requireProfessor();
  const isAdmin = roleAtLeast(membership.role, "ADMIN");
  if (!professor && !isAdmin) {
    return { ok: false, error: "seu usuário não está vinculado a um professor" };
  }
  return { ok: true, tenantId: tenant.id, professorId: professor?.id ?? null, isAdmin };
}

/** Pode mexer nessa sessão? (dono da aula ou admin) */
async function canEditSession(
  sessionId: string,
  c: { tenantId: string; professorId: string | null; isAdmin: boolean },
): Promise<{ id: string } | null> {
  const s = await prisma.classSession.findFirst({
    where: {
      id: sessionId,
      tenantId: c.tenantId,
      ...(c.isAdmin ? {} : { professorId: c.professorId }),
    },
    select: { id: true },
  });
  return s;
}

/** v1.2-A: confirma a presença de um check-in (professor). */
export async function confirmPresence(input: unknown): Promise<Result> {
  const parsed = z.object({ checkInId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const c = await ctx();
  if (!c.ok) return { ok: false, error: c.error };

  const checkin = await prisma.checkIn.findFirst({
    where: { id: parsed.data.checkInId, tenantId: c.tenantId },
    select: { id: true, sessionId: true },
  });
  if (!checkin) return { ok: false, error: "check-in não encontrado" };
  if (!(await canEditSession(checkin.sessionId, c))) {
    return { ok: false, error: "essa aula não é sua" };
  }
  await prisma.checkIn.update({
    where: { id: checkin.id },
    data: { present: true, confirmedAt: new Date() },
  });
  revalidatePath("/professor/chamada");
  return { ok: true };
}

/** Desfaz a confirmação de presença. */
export async function unconfirmPresence(input: unknown): Promise<Result> {
  const parsed = z.object({ checkInId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const c = await ctx();
  if (!c.ok) return { ok: false, error: c.error };

  const checkin = await prisma.checkIn.findFirst({
    where: { id: parsed.data.checkInId, tenantId: c.tenantId },
    select: { id: true, sessionId: true },
  });
  if (!checkin) return { ok: false, error: "check-in não encontrado" };
  if (!(await canEditSession(checkin.sessionId, c))) {
    return { ok: false, error: "essa aula não é sua" };
  }
  await prisma.checkIn.update({
    where: { id: checkin.id },
    data: { present: false, confirmedAt: null },
  });
  revalidatePath("/professor/chamada");
  return { ok: true };
}

/** v1.2-A: professor adiciona presença de quem veio sem bater check-in. */
export async function addPresence(input: unknown): Promise<Result> {
  const parsed = z
    .object({ sessionId: z.string().min(1), alunoId: z.string().min(1) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const c = await ctx();
  if (!c.ok) return { ok: false, error: c.error };

  if (!(await canEditSession(parsed.data.sessionId, c))) {
    return { ok: false, error: "essa aula não é sua" };
  }
  const aluno = await prisma.aluno.findFirst({
    where: { id: parsed.data.alunoId, tenantId: c.tenantId },
    select: { id: true },
  });
  if (!aluno) return { ok: false, error: "aluno não encontrado" };

  await prisma.checkIn.upsert({
    where: { sessionId_alunoId: { sessionId: parsed.data.sessionId, alunoId: aluno.id } },
    create: {
      tenantId: c.tenantId,
      sessionId: parsed.data.sessionId,
      alunoId: aluno.id,
      source: "PROFESSOR",
      present: true,
      confirmedAt: new Date(),
    },
    update: { present: true, confirmedAt: new Date() },
  });
  revalidatePath("/professor/chamada");
  return { ok: true };
}

/** Remove um check-in adicionado por engano (só os que o professor marcou). */
export async function removePresence(input: unknown): Promise<Result> {
  const parsed = z.object({ checkInId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const c = await ctx();
  if (!c.ok) return { ok: false, error: c.error };

  const checkin = await prisma.checkIn.findFirst({
    where: { id: parsed.data.checkInId, tenantId: c.tenantId },
    select: { id: true, sessionId: true, source: true },
  });
  if (!checkin) return { ok: false, error: "check-in não encontrado" };
  if (checkin.source !== "PROFESSOR") {
    return { ok: false, error: "esse check-in foi feito pelo aluno — só dá pra tirar a confirmação" };
  }
  if (!(await canEditSession(checkin.sessionId, c))) {
    return { ok: false, error: "essa aula não é sua" };
  }
  await prisma.checkIn.delete({ where: { id: checkin.id } });
  revalidatePath("/professor/chamada");
  return { ok: true };
}

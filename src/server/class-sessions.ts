/**
 * v1.2-A: sessões de aula (ocorrências do dia) + visão do aluno.
 *
 * A grade (ClassGridSlot) é o "cardápio" semanal recorrente. A SessãoDeAula é a
 * ocorrência concreta num dia — é nela que o aluno faz check-in. Geramos as
 * sessões sob demanda pro dia (upsert idempotente), sem cron: só dias com
 * acesso ganham sessão.
 */
import { endOfDay, startOfDay } from "date-fns";

import { prisma } from "@/lib/prisma";

import { isoDayOfWeek } from "./professor-classes";

/** Garante que as sessões do dia existem (uma por slot ativo da grade). */
export async function ensureSessionsForDay(
  tenantId: string,
  date: Date,
): Promise<void> {
  const day = startOfDay(date);
  const dow = isoDayOfWeek(date);
  const slots = await prisma.classGridSlot.findMany({
    where: { tenantId, dayOfWeek: dow, active: true },
  });
  if (slots.length === 0) return;

  await Promise.all(
    slots.map((s) =>
      prisma.classSession.upsert({
        where: { gridSlotId_date: { gridSlotId: s.id, date: day } },
        create: {
          tenantId,
          gridSlotId: s.id,
          date: day,
          startTime: s.startTime,
          label: s.label,
          isKids: s.isKids,
          professorId: s.professorId,
        },
        // Não sobrescreve nada já existente (professor pode ter ajustado).
        update: {},
      }),
    ),
  );
}

export type AlunoSession = {
  id: string;
  startTime: string;
  label: string;
  isKids: boolean;
  professorName: string | null;
  checkinCount: number;
  checkinLimit: number;
  myCheckin: { present: boolean } | null;
};

/** Aulas do dia pro aluno, já com o status de check-in dele. */
export async function getAlunoDay(
  tenantId: string,
  alunoId: string,
  date: Date,
): Promise<AlunoSession[]> {
  await ensureSessionsForDay(tenantId, date);
  const day = startOfDay(date);
  const dayEnd = endOfDay(date);

  const sessions = await prisma.classSession.findMany({
    where: { tenantId, date: { gte: day, lte: dayEnd } },
    orderBy: { startTime: "asc" },
    include: {
      professor: { select: { name: true } },
      checkIns: { where: { alunoId }, select: { present: true } },
      _count: { select: { checkIns: true } },
    },
  });

  return sessions.map((s) => ({
    id: s.id,
    startTime: s.startTime,
    label: s.label,
    isKids: s.isKids,
    professorName: s.professor?.name ?? null,
    checkinCount: s._count.checkIns,
    checkinLimit: s.checkinLimit,
    myCheckin: s.checkIns[0] ? { present: s.checkIns[0].present } : null,
  }));
}

export type ChamadaCheckin = {
  checkInId: string;
  alunoId: string;
  alunoNome: string;
  matricula: string | null;
  present: boolean;
  source: "ALUNO" | "PROFESSOR";
};
export type ChamadaSession = {
  id: string;
  startTime: string;
  label: string;
  isKids: boolean;
  professorName: string | null;
  checkins: ChamadaCheckin[];
};

/**
 * v1.2-A: chamada do dia pro professor — as sessões dele (ou todas, se admin)
 * com a lista de quem fez check-in, pra confirmar presença. `isAdmin` mostra
 * todas as aulas do tenant (Anderson é supervisor).
 */
export async function getChamadaForDay(
  tenantId: string,
  professorId: string | null,
  date: Date,
  isAdmin: boolean,
): Promise<ChamadaSession[]> {
  await ensureSessionsForDay(tenantId, date);
  const day = startOfDay(date);
  const dayEnd = endOfDay(date);

  const sessions = await prisma.classSession.findMany({
    where: {
      tenantId,
      date: { gte: day, lte: dayEnd },
      ...(isAdmin || !professorId ? {} : { professorId }),
    },
    orderBy: { startTime: "asc" },
    include: {
      professor: { select: { name: true } },
      checkIns: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          present: true,
          source: true,
          aluno: {
            select: { id: true, matricula: true, lead: { select: { name: true } } },
          },
        },
      },
    },
  });

  return sessions.map((s) => ({
    id: s.id,
    startTime: s.startTime,
    label: s.label,
    isKids: s.isKids,
    professorName: s.professor?.name ?? null,
    checkins: s.checkIns.map((c) => ({
      checkInId: c.id,
      alunoId: c.aluno.id,
      alunoNome: c.aluno.lead.name,
      matricula: c.aluno.matricula,
      present: c.present,
      source: c.source as "ALUNO" | "PROFESSOR",
    })),
  }));
}

/** Alunos ativos do tenant (pro professor adicionar presença manual). */
export async function getActiveAlunos(tenantId: string) {
  const alunos = await prisma.aluno.findMany({
    where: { tenantId, active: true },
    select: { id: true, matricula: true, lead: { select: { name: true } } },
  });
  return alunos
    .map((a) => ({ id: a.id, nome: a.lead.name, matricula: a.matricula }))
    .sort((a, b) => a.nome.localeCompare(b.nome));
}

export type WeekDay = {
  dayOfWeek: number; // ISO 1=Seg..7=Dom
  classes: { startTime: string; label: string; professorName: string | null }[];
};

/** Cronograma da semana (a partir da grade) pra exibir na tela do aluno. */
export async function getWeekSchedule(tenantId: string): Promise<WeekDay[]> {
  const slots = await prisma.classGridSlot.findMany({
    where: { tenantId, active: true },
    orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }],
    select: {
      dayOfWeek: true,
      startTime: true,
      label: true,
      professor: { select: { name: true } },
    },
  });

  const byDay = new Map<number, WeekDay["classes"]>();
  for (const s of slots) {
    const arr = byDay.get(s.dayOfWeek) ?? [];
    arr.push({
      startTime: s.startTime,
      label: s.label,
      professorName: s.professor?.name ?? null,
    });
    byDay.set(s.dayOfWeek, arr);
  }
  return [1, 2, 3, 4, 5, 6, 7].map((d) => ({
    dayOfWeek: d,
    classes: byDay.get(d) ?? [],
  }));
}

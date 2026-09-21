/**
 * v1.2-BJ: agendamento de provas de graduação.
 *
 * Horários FIXOS (America/Sao_Paulo, -03): seg-sex 08/10/13/16h, sáb 08/11h.
 * 1 prova por slot (dura ~1h; os slots já respeitam o espaçamento pedido).
 * Janela de provas configurável abaixo. Pedido do Anderson (reunião 16/09).
 */
import { prisma } from "@/lib/prisma";

const TZ = "-03:00";

/** Janela de provas (inclusive). Ajustar aqui quando o Anderson pedir. */
export const EXAM_WINDOW = { start: "2026-10-26", end: "2026-11-27" };

/** Horários fixos por dia da semana (0=Dom..6=Sáb). */
const SLOTS_BY_DOW: Record<number, string[]> = {
  0: [], // domingo
  1: ["08:00", "10:00", "13:00", "16:00"],
  2: ["08:00", "10:00", "13:00", "16:00"],
  3: ["08:00", "10:00", "13:00", "16:00"],
  4: ["08:00", "10:00", "13:00", "16:00"],
  5: ["08:00", "10:00", "13:00", "16:00"],
  6: ["08:00", "11:00"], // sábado
};

const DOW_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function slotDate(dateStr: string, time: string): Date {
  return new Date(`${dateStr}T${time}:00${TZ}`);
}

/** Lista os dias da janela (YYYY-MM-DD) que têm ao menos um slot. */
function windowDays(): { dateStr: string; dow: number; label: string }[] {
  const out: { dateStr: string; dow: number; label: string }[] = [];
  const cur = new Date(`${EXAM_WINDOW.start}T12:00:00${TZ}`);
  const end = new Date(`${EXAM_WINDOW.end}T12:00:00${TZ}`);
  while (cur.getTime() <= end.getTime()) {
    const dateStr = `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, "0")}-${String(cur.getDate()).padStart(2, "0")}`;
    const dow = cur.getDay();
    if (SLOTS_BY_DOW[dow]?.length) {
      out.push({ dateStr, dow, label: DOW_LABEL[dow] });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

/** Conjunto de slots válidos (ISO) — usado pra validar no servidor. */
export function validSlotSet(): Set<string> {
  const set = new Set<string>();
  for (const d of windowDays()) {
    for (const t of SLOTS_BY_DOW[d.dow]) set.add(slotDate(d.dateStr, t).toISOString());
  }
  return set;
}

export type ExamSlot = {
  iso: string;
  time: string;
  exam: {
    id: string;
    alunoNome: string;
    matricula: string | null;
    targetBelt: string | null;
    targetBeltDegree: number | null;
    professorNome: string | null;
    status: string;
    notes: string | null;
  } | null;
};
export type ExamDay = { dateStr: string; label: string; slots: ExamSlot[] };

/** Agenda completa da janela: dias → slots (com a prova, se agendada). */
export async function getExamSchedule(tenantId: string): Promise<ExamDay[]> {
  const days = windowDays();
  if (days.length === 0) return [];

  const from = slotDate(days[0].dateStr, "00:00");
  const lastDay = days[days.length - 1];
  const to = slotDate(lastDay.dateStr, "23:59");

  const exams = await prisma.graduationExam.findMany({
    where: { tenantId, scheduledAt: { gte: from, lte: to }, status: { not: "CANCELED" } },
    select: {
      id: true,
      scheduledAt: true,
      targetBelt: true,
      targetBeltDegree: true,
      status: true,
      notes: true,
      aluno: { select: { matricula: true, lead: { select: { name: true } } } },
      professor: { select: { name: true } },
    },
  });
  const byIso = new Map(exams.map((e) => [e.scheduledAt.toISOString(), e]));

  return days.map((d) => ({
    dateStr: d.dateStr,
    label: d.label,
    slots: SLOTS_BY_DOW[d.dow].map((t) => {
      const iso = slotDate(d.dateStr, t).toISOString();
      const e = byIso.get(iso);
      return {
        iso,
        time: t,
        exam: e
          ? {
              id: e.id,
              alunoNome: e.aluno.lead.name,
              matricula: e.aluno.matricula,
              targetBelt: e.targetBelt,
              targetBeltDegree: e.targetBeltDegree,
              professorNome: e.professor?.name ?? null,
              status: e.status,
              notes: e.notes,
            }
          : null,
      };
    }),
  }));
}

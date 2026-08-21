/**
 * v1.2-P: fechamento mensal do professor (congelado).
 *
 * No fim do mês, o total do quadro de cada professor vira um "recebimento"
 * imutável daquele mês (pago até dia 7). O snapshot é gerado SOB DEMANDA pra
 * meses já fechados (competência < mês atual) — a partir daí não muda mais.
 * Fluxo: admin marca "Pago" → professor marca "Recebido" → envia a NF.
 */
import { endOfMonth, format } from "date-fns";

import { prisma } from "@/lib/prisma";

import { getProfessorClosing } from "./professor-classes";

export function currentCompetencia(d: Date = new Date()): string {
  return format(d, "yyyy-MM");
}

/** "YYYY-MM" → { start, end, isClosed } (fechado = competência anterior à atual). */
function monthRange(competencia: string) {
  const [y, m] = competencia.split("-").map(Number);
  const start = new Date(y!, (m ?? 1) - 1, 1);
  const end = endOfMonth(start);
  return { start, end, isClosed: competencia < currentCompetencia() };
}

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
export function competenciaLabel(c: string): string {
  const [y, m] = c.split("-");
  return `${MESES[Number(m) - 1] ?? m}/${y}`;
}

export type PayoutRow = {
  id: string;
  professorId: string;
  professorName: string;
  competencia: string;
  total: number;
  regularValor: number;
  auxValor: number;
  particularValor: number;
  convValor: number;
  paidAt: Date | null;
  receivedAt: Date | null;
  invoiceId: string | null; // NF daquela competência (se enviada)
  invoiceName: string | null;
};

function toRow(
  p: {
    id: string; professorId: string; competencia: string;
    total: unknown; regularValor: unknown; auxValor: unknown;
    particularValor: unknown; convValor: unknown;
    paidAt: Date | null; receivedAt: Date | null;
    professor: { name: string };
  },
  inv: { id: string; fileName: string } | undefined,
): PayoutRow {
  return {
    id: p.id,
    professorId: p.professorId,
    professorName: p.professor.name,
    competencia: p.competencia,
    total: Number(p.total),
    regularValor: Number(p.regularValor),
    auxValor: Number(p.auxValor),
    particularValor: Number(p.particularValor),
    convValor: Number(p.convValor),
    paidAt: p.paidAt,
    receivedAt: p.receivedAt,
    invoiceId: inv?.id ?? null,
    invoiceName: inv?.fileName ?? null,
  };
}

/** Congela (uma vez) e retorna os fechamentos de uma competência fechada. */
export async function getMonthPayouts(
  tenantId: string,
  competencia: string,
): Promise<PayoutRow[]> {
  const { start, end, isClosed } = monthRange(competencia);
  if (!isClosed) return []; // mês corrente/futuro ainda é projeção — não fecha

  let payouts = await prisma.professorPayout.findMany({
    where: { tenantId, competencia },
    include: { professor: { select: { name: true } } },
  });

  if (payouts.length === 0) {
    const { rows } = await getProfessorClosing(tenantId, start, end);
    const toCreate = rows.filter((r) => r.total > 0);
    if (toCreate.length > 0) {
      await prisma.professorPayout.createMany({
        data: toCreate.map((r) => ({
          tenantId,
          professorId: r.professorId,
          competencia,
          total: r.total,
          regularValor: r.regularValor,
          auxValor: r.auxValor,
          particularValor: r.particularValor,
          convValor: r.convValor,
        })),
        skipDuplicates: true,
      });
      payouts = await prisma.professorPayout.findMany({
        where: { tenantId, competencia },
        include: { professor: { select: { name: true } } },
      });
    }
  }

  const invoices = await prisma.professorInvoice.findMany({
    where: { tenantId, competencia },
    orderBy: { uploadedAt: "desc" },
    select: { id: true, fileName: true, professorId: true },
  });
  const invByProf = new Map(invoices.map((i) => [i.professorId, i]));

  return payouts
    .map((p) => toRow(p, invByProf.get(p.professorId)))
    .sort((a, b) => b.total - a.total);
}

/** Fechamentos de UM professor (mês fechado), pra tela dele. */
export async function getProfessorPayouts(
  tenantId: string,
  professorId: string,
  meses = 6,
): Promise<PayoutRow[]> {
  // Garante o snapshot dos últimos meses fechados.
  const now = new Date();
  for (let i = 1; i <= meses; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    await getMonthPayouts(tenantId, format(d, "yyyy-MM"));
  }
  const payouts = await prisma.professorPayout.findMany({
    where: { tenantId, professorId },
    orderBy: { competencia: "desc" },
    take: meses,
    include: { professor: { select: { name: true } } },
  });
  const invoices = await prisma.professorInvoice.findMany({
    where: { tenantId, professorId },
    select: { id: true, fileName: true, competencia: true },
  });
  const invByComp = new Map(invoices.map((i) => [i.competencia, i]));
  return payouts.map((p) => toRow(p, invByComp.get(p.competencia)));
}

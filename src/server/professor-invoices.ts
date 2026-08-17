/**
 * v1.1-CJ: notas fiscais dos professores (PDF anexado no login deles).
 * Os bytes ficam no Postgres — aqui as queries NUNCA selecionam `data` (só
 * metadados), pra não trazer o PDF inteiro pra memória à toa. O download passa
 * pela rota /api/professor/invoice/[id].
 */
import { format } from "date-fns";

import { prisma } from "@/lib/prisma";

/** Metadados de uma NF (sem os bytes). */
export type InvoiceMeta = {
  id: string;
  competencia: string;
  fileName: string;
  size: number;
  uploadedAt: Date;
};

/** "YYYY-MM" de referência do mês atual (default do seletor). */
export function currentCompetencia(d: Date = new Date()): string {
  return format(d, "yyyy-MM");
}

/** Lista as competências (YYYY-MM) que um período [from,to] cobre. */
export function competenciasInRange(from: Date, to: Date): string[] {
  const out: string[] = [];
  const cur = new Date(from.getFullYear(), from.getMonth(), 1);
  const end = new Date(to.getFullYear(), to.getMonth(), 1);
  while (cur <= end) {
    out.push(format(cur, "yyyy-MM"));
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}

/** NFs de UM professor (metadados), mais recentes primeiro. */
export async function getProfessorInvoices(
  tenantId: string,
  professorId: string,
): Promise<InvoiceMeta[]> {
  return prisma.professorInvoice.findMany({
    where: { tenantId, professorId },
    orderBy: [{ competencia: "desc" }, { uploadedAt: "desc" }],
    select: {
      id: true,
      competencia: true,
      fileName: true,
      size: true,
      uploadedAt: true,
    },
  });
}

/** NFs do período pro admin (agrupadas por professor). */
export async function getInvoicesForPeriod(
  tenantId: string,
  from: Date,
  to: Date,
  professorId?: string,
) {
  const competencias = competenciasInRange(from, to);
  const rows = await prisma.professorInvoice.findMany({
    where: {
      tenantId,
      competencia: { in: competencias },
      ...(professorId ? { professorId } : {}),
    },
    orderBy: [{ competencia: "desc" }, { uploadedAt: "desc" }],
    select: {
      id: true,
      competencia: true,
      fileName: true,
      size: true,
      uploadedAt: true,
      professor: { select: { id: true, name: true } },
    },
  });

  // Agrupa por professor.
  const byProf = new Map<
    string,
    { professorId: string; professorName: string; invoices: InvoiceMeta[] }
  >();
  for (const r of rows) {
    const g = byProf.get(r.professor.id) ?? {
      professorId: r.professor.id,
      professorName: r.professor.name,
      invoices: [],
    };
    g.invoices.push({
      id: r.id,
      competencia: r.competencia,
      fileName: r.fileName,
      size: r.size,
      uploadedAt: r.uploadedAt,
    });
    byProf.set(r.professor.id, g);
  }
  return [...byProf.values()].sort((a, b) =>
    a.professorName.localeCompare(b.professorName),
  );
}

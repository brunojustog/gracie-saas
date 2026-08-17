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

/**
 * NFs recentes pro admin (agrupadas por professor), mais novas primeiro.
 * NÃO filtra por período do fechamento — o professor sempre emite a NF do mês
 * anterior, então prender a lista ao "mês atual" fazia elas sumirem. Cada NF
 * carrega o selo da competência (mês de referência) pra não perder o contexto.
 */
export async function getRecentInvoices(
  tenantId: string,
  professorId?: string,
) {
  const rows = await prisma.professorInvoice.findMany({
    where: { tenantId, ...(professorId ? { professorId } : {}) },
    orderBy: [{ uploadedAt: "desc" }],
    select: {
      id: true,
      competencia: true,
      fileName: true,
      size: true,
      uploadedAt: true,
      professor: { select: { id: true, name: true } },
    },
  });

  // Agrupa por professor, preservando a ordem (professor com upload mais
  // recente aparece primeiro).
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
  return [...byProf.values()];
}

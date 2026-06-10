/**
 * Camada de dados de vencimentos/pagamentos (v1.1-AB).
 *
 * "Inadimplente" é estado DERIVADO, não persistido: matrícula ACTIVE com
 * nextDueDate < hoje. Confirmar pagamento (action em /matriculas) cria um
 * PaymentRecord e avança o nextDueDate +1 mês — o que naturalmente tira o
 * aluno da lista.
 *
 * Mascaramento financeiro segue a política v1.1-P: SELLER vê quem deve e
 * quando vence (precisa cobrar), mas não vê valores.
 */
import { addDays, differenceInCalendarDays, startOfDay } from "date-fns";
import type { TenantUser } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type DueRow = {
  enrollmentId: string;
  leadId: string;
  leadName: string;
  leadPhone: string | null;
  planName: string;
  modalityName: string;
  nextDueDate: Date;
  /** null pra SELLER (mascarado). */
  monthlyValue: number | null;
  /** > 0 só nas vencidas. */
  daysOverdue: number;
};

export type DueOverview = {
  /** Vencidas e ainda não pagas (ACTIVE, nextDueDate < hoje). Mais antigas primeiro. */
  overdue: DueRow[];
  /** Vencem entre hoje e hoje+horizonDays (inclusive). Mais próximas primeiro. */
  upcoming: DueRow[];
  horizonDays: number;
};

export async function getDueOverview(
  membership: TenantUser,
  horizonDays = 7,
): Promise<DueOverview> {
  const today = startOfDay(new Date());
  // lt no dia seguinte ao fim do horizonte ⇒ inclui o próprio dia-limite.
  const horizonEnd = addDays(today, horizonDays + 1);

  const rows = await prisma.enrollment.findMany({
    where: {
      tenantId: membership.tenantId,
      status: "ACTIVE",
      nextDueDate: { not: null, lt: horizonEnd },
    },
    select: {
      id: true,
      nextDueDate: true,
      monthlyValue: true,
      lead: { select: { id: true, name: true, phone: true } },
      plan: { select: { name: true } },
      modality: { select: { name: true } },
    },
    orderBy: { nextDueDate: "asc" },
  });

  const isSeller = membership.role === "SELLER";
  const mapped: DueRow[] = rows.map((r) => ({
    enrollmentId: r.id,
    leadId: r.lead.id,
    leadName: r.lead.name,
    leadPhone: r.lead.phone,
    planName: r.plan.name,
    modalityName: r.modality.name,
    nextDueDate: r.nextDueDate!,
    monthlyValue: isSeller ? null : Number(r.monthlyValue),
    daysOverdue: Math.max(
      0,
      differenceInCalendarDays(today, r.nextDueDate!),
    ),
  }));

  return {
    overdue: mapped.filter((r) => r.daysOverdue > 0),
    upcoming: mapped.filter((r) => r.daysOverdue === 0),
    horizonDays,
  };
}

/** Contagem rápida de inadimplentes (KPI da tela de matrículas). */
export async function countOverdue(membership: TenantUser): Promise<number> {
  return prisma.enrollment.count({
    where: {
      tenantId: membership.tenantId,
      status: "ACTIVE",
      nextDueDate: { not: null, lt: startOfDay(new Date()) },
    },
  });
}

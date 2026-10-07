/**
 * v1.2-BW: controle financeiro mensal das mensalidades (reunião 05/10 — B1).
 *
 * Base: pra o mês de referência mostra PREVISTO (soma das mensalidades das
 * matrículas ativas) × RECEBIDO (soma dos PaymentRecord pagos no mês) e a
 * quebra PAGOS × NÃO PAGOS por matrícula, com semáforo:
 *   verde  = pagou neste mês
 *   âmbar  = ainda não pagou, mas dentro do prazo (não venceu além da carência)
 *   vermelho = inadimplente (venceu além da carência, sem baixa)
 *
 * As REGRAS FINAS de inadimplência (corte 15/30 dias, multa) dependem do que
 * o Anderson+Gi definirem (item C1 da reunião) — ficam pra depois. Aqui é a
 * base clicável. Mascaramento de valores segue a política v1.1-P (SELLER não
 * entra aqui; tela é de gestão).
 */
import { endOfMonth, startOfMonth } from "date-fns";
import type { PaymentMethod, TenantUser } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { isOverdue } from "@/lib/overdue";

export type FinancialStatus = "paid" | "due" | "overdue";

export type FinancialRow = {
  enrollmentId: string;
  leadId: string;
  leadName: string;
  payerName: string | null;
  leadPhone: string | null;
  planName: string;
  modalityName: string;
  /** null quando o usuário não é ADM (valores mascarados). */
  monthlyValue: number | null;
  nextDueDate: Date | null;
  paid: boolean;
  paidAt: Date | null;
  paidAmount: number | null;
  daysOverdue: number;
  status: FinancialStatus;
  /** Forma de pagamento: a usada na baixa do mês, senão a cadastrada na matrícula. */
  paymentMethod: PaymentMethod | null;
};

export type FinancialOverview = {
  monthRef: string; // YYYY-MM
  monthLabel: string;
  /** null quando o usuário não é ADM (valores mascarados; v1.2-BY). */
  previsto: number | null;
  recebido: number | null;
  pagosCount: number;
  naoPagosCount: number;
  overdueCount: number;
  /** true só pra ADM — libera os valores em R$. */
  canSeeValues: boolean;
  rows: FinancialRow[];
};

const MONTHS = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
];

/** Resolve o mês de referência (YYYY-MM) pra um Date no fuso local do servidor. */
function monthBounds(ref?: string): { start: Date; end: Date; key: string; label: string } {
  let base: Date;
  if (ref && /^\d{4}-\d{2}$/.test(ref)) {
    const [y, m] = ref.split("-").map(Number);
    base = new Date(y, m - 1, 1);
  } else {
    base = new Date();
  }
  const start = startOfMonth(base);
  const end = endOfMonth(base);
  const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`;
  const label = `${MONTHS[start.getMonth()]} de ${start.getFullYear()}`;
  return { start, end, key, label };
}

export async function getFinancialOverview(
  membership: TenantUser,
  ref?: string,
): Promise<FinancialOverview> {
  const { start, end, key, label } = monthBounds(ref);
  const now = new Date();
  // v1.2-BY: só ADM enxerga valores em R$ (as meninas veem só a situação).
  const canSeeValues = membership.role === "ADMIN";

  const [enrollments, received] = await Promise.all([
    prisma.enrollment.findMany({
      where: { tenantId: membership.tenantId, status: "ACTIVE" },
      select: {
        id: true,
        monthlyValue: true,
        nextDueDate: true,
        paymentMethod: true,
        lead: { select: { id: true, name: true, phone: true, payerName: true } },
        plan: { select: { name: true } },
        modality: { select: { name: true } },
        payments: {
          where: { paidAt: { gte: start, lte: end } },
          orderBy: { paidAt: "desc" },
          take: 1,
          select: { paidAt: true, amount: true, method: true },
        },
      },
      orderBy: { nextDueDate: "asc" },
    }),
    // Recebido no mês = tudo que entrou via baixa (inclui matrículas que já
    // saíram/pausaram depois); conta o caixa real do mês.
    prisma.paymentRecord.aggregate({
      where: { tenantId: membership.tenantId, paidAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
  ]);

  let previsto = 0;
  let pagosCount = 0;
  let overdueCount = 0;

  const rows: FinancialRow[] = enrollments.map((e) => {
    const monthlyValue = Number(e.monthlyValue);
    previsto += monthlyValue;
    const payment = e.payments[0] ?? null;
    const paid = payment !== null;
    let status: FinancialStatus;
    let daysOverdue = 0;
    if (paid) {
      status = "paid";
      pagosCount++;
    } else if (isOverdue(e.nextDueDate, now)) {
      status = "overdue";
      overdueCount++;
      if (e.nextDueDate) {
        daysOverdue = Math.max(
          0,
          Math.floor((now.getTime() - e.nextDueDate.getTime()) / 86_400_000),
        );
      }
    } else {
      status = "due";
    }
    return {
      enrollmentId: e.id,
      leadId: e.lead.id,
      leadName: e.lead.name,
      payerName: e.lead.payerName,
      leadPhone: e.lead.phone,
      planName: e.plan.name,
      modalityName: e.modality.name,
      // v1.2-BY: só ADM vê valores em R$.
      monthlyValue: canSeeValues ? monthlyValue : null,
      nextDueDate: e.nextDueDate,
      paid,
      paidAt: payment?.paidAt ?? null,
      paidAmount: canSeeValues && payment ? Number(payment.amount) : null,
      daysOverdue,
      status,
      paymentMethod: payment?.method ?? e.paymentMethod,
    };
  });

  return {
    monthRef: key,
    monthLabel: label,
    previsto: canSeeValues ? previsto : null,
    recebido: canSeeValues ? Number(received._sum.amount ?? 0) : null,
    pagosCount,
    naoPagosCount: rows.length - pagosCount,
    overdueCount,
    canSeeValues,
    rows,
  };
}

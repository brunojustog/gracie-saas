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
import { differenceInCalendarDays, endOfMonth, startOfDay, startOfMonth } from "date-fns";
import type { PaymentMethod, TenantUser } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { OVERDUE_GRACE_DAYS } from "@/lib/overdue";

export type FinancialStatus = "paid" | "due" | "overdue";

export type FinancialRow = {
  enrollmentId: string;
  leadId: string;
  leadName: string;
  payerName: string | null;
  leadPhone: string | null;
  planName: string;
  modalityName: string;
  /** Mensalidade do aluno — visível a todas as contas (v1.2-BZ). */
  monthlyValue: number;
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
  /** null pra SELLER — a caixa de totais some (mensalidade por linha fica). v1.2-BZ. */
  previsto: number | null;
  recebido: number | null;
  pagosCount: number;
  naoPagosCount: number;
  overdueCount: number;
  /** true p/ MANAGER+ADMIN — mostra a caixa de totais (previsto/recebido). */
  canSeeTotals: boolean;
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
  // v1.2-BZ: a caixa de totais some pra vendedora; a mensalidade por linha
  // aparece pra todas as contas.
  const canSeeTotals = membership.role !== "SELLER";

  const [enrollments, received] = await Promise.all([
    prisma.enrollment.findMany({
      // Só matrículas que já existiam no mês de referência (enrolledAt <= fim
      // do mês) — não mostra aluno novo em meses passados. v1.2-BZ.
      where: {
        tenantId: membership.tenantId,
        status: "ACTIVE",
        enrolledAt: { lte: end },
      },
      select: {
        id: true,
        monthlyValue: true,
        nextDueDate: true,
        enrolledAt: true,
        paymentMethod: true,
        paidInFullUntil: true,
        lead: { select: { id: true, name: true, phone: true, payerName: true } },
        plan: { select: { name: true } },
        modality: { select: { name: true } },
        // v1.2-BZ: pagamento ESPECÍFICO do mês de referência — a baixa guarda o
        // vencimento quitado (dueDate). Inadimplência é por mês, não acumula.
        payments: {
          where: { dueDate: { gte: start, lte: end } },
          orderBy: { paidAt: "desc" },
          take: 1,
          select: { paidAt: true, amount: true, method: true },
        },
      },
      orderBy: { nextDueDate: "asc" },
    }),
    // Recebido no mês = tudo que entrou via baixa (caixa real do mês).
    prisma.paymentRecord.aggregate({
      where: { tenantId: membership.tenantId, paidAt: { gte: start, lte: end } },
      _sum: { amount: true },
    }),
  ]);

  const today = startOfDay(now);
  const daysInRefMonth = end.getDate();

  let previsto = 0;
  let pagosCount = 0;
  let overdueCount = 0;

  const rows: FinancialRow[] = enrollments.map((e) => {
    const monthlyValue = Number(e.monthlyValue);
    previsto += monthlyValue;
    const payment = e.payments[0] ?? null;
    // Pago o MÊS: baixa com vencimento no mês, ou quitação em dia que cobre o mês.
    const paidInFull = e.paidInFullUntil != null && e.paidInFullUntil >= end;
    const paid = payment !== null || paidInFull;

    // Vencimento do mês de referência (dia de cobrança da matrícula aplicado ao mês).
    const billingDay = (e.nextDueDate ?? e.enrolledAt).getDate();
    const dueThisMonth = new Date(
      start.getFullYear(),
      start.getMonth(),
      Math.min(billingDay, daysInRefMonth),
    );

    let status: FinancialStatus;
    let daysOverdue = 0;
    if (paid) {
      status = "paid";
      pagosCount++;
    } else if (differenceInCalendarDays(today, dueThisMonth) >= OVERDUE_GRACE_DAYS) {
      // Passou do vencimento do mês + carência → inadimplente daquele mês.
      status = "overdue";
      overdueCount++;
      daysOverdue = differenceInCalendarDays(today, dueThisMonth);
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
      monthlyValue,
      nextDueDate: dueThisMonth,
      paid,
      paidAt: payment?.paidAt ?? null,
      paidAmount: payment ? Number(payment.amount) : null,
      daysOverdue,
      status,
      paymentMethod: payment?.method ?? e.paymentMethod,
    };
  });

  return {
    monthRef: key,
    monthLabel: label,
    previsto: canSeeTotals ? previsto : null,
    recebido: canSeeTotals ? Number(received._sum.amount ?? 0) : null,
    pagosCount,
    naoPagosCount: rows.length - pagosCount,
    overdueCount,
    canSeeTotals,
    rows,
  };
}

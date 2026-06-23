/**
 * Camada de dados de Enrollment (matrícula).
 *
 * Política de visibilidade (v1.1-O): qualquer role do tenant vê todas
 * as matrículas do tenant. Espelha leads.ts/experimental-classes.ts.
 *
 * Enrollment é 1:1 com Lead — tentativa de criar duplicata viola constraint
 * unique do schema. Os helpers aqui assumem que essa unicidade está
 * garantida no banco e expõem erros amigáveis na server action.
 */
import { addDays, startOfDay } from "date-fns";
import type {
  Gender,
  PaymentMethod,
  Prisma,
  TenantUser,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { overdueCutoff } from "@/lib/overdue";

export function scopedEnrollmentWhere(
  membership: TenantUser,
): Prisma.EnrollmentWhereInput {
  return { tenantId: membership.tenantId };
}

/**
 * v1.1-AB: recorte por vencimento. Sempre implica status ACTIVE (cancelada/
 * congelada não cobra) — sobrepõe o filtro de status quando setado.
 *   - "overdue": inadimplentes (nextDueDate < hoje)
 *   - "due7": vence entre hoje e hoje+7 (inclusive)
 */
export type DueFilter = "overdue" | "due7";

/**
 * v1.1-AT/AU: "status" da matrícula na visão da lista. Congelada não é mais
 * um status no banco (é ACTIVE + suspendedAt) — aqui vira uma visão derivada.
 *   - ATIVA      = ACTIVE e não congelada
 *   - CONGELADA  = ACTIVE e congelada (suspendedAt != null)
 *   - CANCELADA  = CANCELED
 *   - JUDICIAL   = JUDICIAL
 */
export type StatusView = "ATIVA" | "CONGELADA" | "CANCELADA" | "JUDICIAL";

function statusViewWhere(v: StatusView): Prisma.EnrollmentWhereInput {
  switch (v) {
    case "ATIVA":
      return { status: "ACTIVE", suspendedAt: null };
    case "CONGELADA":
      return { status: "ACTIVE", suspendedAt: { not: null } };
    case "CANCELADA":
      return { status: "CANCELED" };
    case "JUDICIAL":
      return { status: "JUDICIAL" };
  }
}

export type EnrollmentListFilters = {
  search?: string;
  /** v1.1-AL: multi-seleção. Vazio/ausente = todas as modalidades. */
  modalityIds?: string[];
  /** v1.1-AX: multi-seleção. Vazio/ausente = todos os planos. */
  planIds?: string[];
  /** v1.1-AV: multi-seleção. */
  paymentMethods?: PaymentMethod[];
  /** v1.1-AV: multi-seleção de status (visão derivada). */
  statusViews?: StatusView[];
  due?: DueFilter;
  /** v1.1-AL: sexo do aluno. */
  gender?: Gender;
  /** v1.1-AL: dia do mês do vencimento (1-31). Filtrado em JS pós-fetch. */
  dueDay?: number;
};

export function buildEnrollmentListWhere(
  membership: TenantUser,
  filters: EnrollmentListFilters,
): Prisma.EnrollmentWhereInput {
  const where: Prisma.EnrollmentWhereInput = {
    tenantId: membership.tenantId,
  };

  if (filters.modalityIds && filters.modalityIds.length > 0) {
    where.modalityId = { in: filters.modalityIds };
  }
  if (filters.planIds && filters.planIds.length > 0) {
    where.planId = { in: filters.planIds };
  }
  if (filters.paymentMethods && filters.paymentMethods.length > 0) {
    where.paymentMethod = { in: filters.paymentMethods };
  }
  if (filters.statusViews && filters.statusViews.length > 0) {
    // Cada visão vira um fragmento; multi-seleção = OR.
    where.OR = filters.statusViews.map(statusViewWhere);
  }

  // Filtros que recaem no Lead (sexo + busca) compartilham o mesmo objeto.
  // deletedAt:null sempre — matrículas de leads excluídos (ex.: duplicatas)
  // não aparecem em listas nem contagens (v1.1-BA).
  const leadWhere: Prisma.LeadWhereInput = { deletedAt: null };
  if (filters.gender) leadWhere.gender = filters.gender;
  if (filters.search?.trim()) {
    leadWhere.name = { contains: filters.search.trim(), mode: "insensitive" };
  }

  if (filters.due) {
    const today = startOfDay(new Date());
    where.status = "ACTIVE";
    where.suspendedAt = filters.due === "overdue" ? undefined : where.suspendedAt;
    where.nextDueDate =
      filters.due === "overdue"
        ? { not: null, lt: overdueCutoff() } // inadimplente só após a carência
        : { not: null, gte: today, lt: addDays(today, 8) };
  }

  where.lead = leadWhere;

  return where;
}

export async function getEnrollmentsForList(
  membership: TenantUser,
  filters: EnrollmentListFilters = {},
) {
  const rows = await prisma.enrollment.findMany({
    where: buildEnrollmentListWhere(membership, filters),
    select: {
      id: true,
      enrolledAt: true,
      canceledAt: true,
      suspendedAt: true,
      suspensionReason: true,
      frozenKind: true,
      expectedReturnAt: true,
      frozenDaysUsed: true,
      contractEndAt: true,
      nextDueDate: true,
      paidInFullUntil: true,
      monthlyValue: true,
      paymentMethod: true,
      status: true,
      observations: true,
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          gender: true,
          belt: true,
          beltDegree: true,
          assignedSeller: { select: { id: true, name: true, email: true } },
        },
      },
      modality: { select: { id: true, name: true, color: true } },
      plan: { select: { id: true, name: true } },
    },
    orderBy: { enrolledAt: "desc" },
  });

  // Dia de vencimento filtra em JS (Prisma não filtra por EXTRACT(day)).
  const filtered = filters.dueDay
    ? rows.filter((r) => r.nextDueDate?.getDate() === filters.dueDay)
    : rows;

  // SELLER não vê valor de matrícula — mascara no payload pra não vazar via
  // RSC stream / DevTools. UI espelha com `hideFinancials`.
  const isSeller = membership.role === "SELLER";
  return filtered.map((r) => ({
    ...r,
    monthlyValue: isSeller ? null : r.monthlyValue,
  }));
}

export async function findEnrollmentInScope(
  membership: TenantUser,
  enrollmentId: string,
) {
  return prisma.enrollment.findFirst({
    where: { id: enrollmentId, ...scopedEnrollmentWhere(membership) },
  });
}

/**
 * Contagens globais de matrículas por situação (v1.1-AV). Independe dos
 * filtros da lista — alimenta os KPIs da tela e o Quadro do Vitor.
 *   - ativas: ACTIVE não congeladas
 *   - congeladas: ACTIVE congeladas (suspendedAt != null)
 *   - canceladas: CANCELED
 *   - judicial: JUDICIAL
 *   - cancelamentosTotal: canceladas + judicial (o "cancelamento" do negócio)
 *   - monthlyRevenue: soma dos ativos (inclui congelados, que seguem cobrando)
 */
export async function getEnrollmentStatusCounts(membership: TenantUser) {
  const tenantId = membership.tenantId;
  // Ignora matrículas de leads excluídos (duplicatas removidas) — v1.1-BA.
  const live = { tenantId, lead: { deletedAt: null } };
  // v1.1-BB: quitados (paidInFullUntil >= hoje) saem da receita recorrente.
  const today = startOfDay(new Date());
  const notPrepaid = { NOT: { paidInFullUntil: { gte: today } } };
  const [active, frozen, canceled, judicial, revenueAgg] = await Promise.all([
    prisma.enrollment.count({ where: { ...live, status: "ACTIVE", suspendedAt: null } }),
    prisma.enrollment.count({ where: { ...live, status: "ACTIVE", suspendedAt: { not: null } } }),
    prisma.enrollment.count({ where: { ...live, status: "CANCELED" } }),
    prisma.enrollment.count({ where: { ...live, status: "JUDICIAL" } }),
    prisma.enrollment.aggregate({
      where: { ...live, status: "ACTIVE", ...notPrepaid },
      _sum: { monthlyValue: true },
    }),
  ]);
  return {
    ativas: active,
    congeladas: frozen,
    totalAtivos: active + frozen,
    canceladas: canceled,
    judicial,
    cancelamentosTotal: canceled + judicial,
    monthlyRevenue: Number(revenueAgg._sum.monthlyValue ?? 0),
  };
}

export type EnrollmentRow = Awaited<
  ReturnType<typeof getEnrollmentsForList>
>[number];

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
  EnrollmentStatus,
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

export type EnrollmentListFilters = {
  search?: string;
  /** v1.1-AL: multi-seleção. Vazio/ausente = todas as modalidades. */
  modalityIds?: string[];
  planId?: string;
  paymentMethod?: PaymentMethod;
  status?: EnrollmentStatus;
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
  if (filters.planId) where.planId = filters.planId;
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
  if (filters.status) where.status = filters.status;

  // Filtros que recaem no Lead (sexo + busca) compartilham o mesmo objeto.
  const leadWhere: Prisma.LeadWhereInput = {};
  if (filters.gender) leadWhere.gender = filters.gender;
  if (filters.search?.trim()) {
    leadWhere.name = { contains: filters.search.trim(), mode: "insensitive" };
  }

  if (filters.due) {
    const today = startOfDay(new Date());
    where.status = "ACTIVE";
    where.nextDueDate =
      filters.due === "overdue"
        ? { not: null, lt: overdueCutoff() } // inadimplente só após a carência
        : { not: null, gte: today, lt: addDays(today, 8) };
  }

  if (Object.keys(leadWhere).length > 0) where.lead = leadWhere;

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
      expectedReturnAt: true,
      nextDueDate: true,
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

export type EnrollmentRow = Awaited<
  ReturnType<typeof getEnrollmentsForList>
>[number];

/**
 * Camada de dados de Enrollment (matrícula).
 *
 * Política de visibilidade (espelha leads/experimental-classes):
 *   - ADMIN, MANAGER → todas as matrículas do tenant
 *   - SELLER         → APENAS matrículas de leads atribuídos a si
 *
 * Enrollment é 1:1 com Lead — tentativa de criar duplicata viola constraint
 * unique do schema. Os helpers aqui assumem que essa unicidade está
 * garantida no banco e expõem erros amigáveis na server action.
 */
import type { EnrollmentStatus, Prisma, TenantUser } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function scopedEnrollmentWhere(
  membership: TenantUser,
): Prisma.EnrollmentWhereInput {
  const base: Prisma.EnrollmentWhereInput = {
    tenantId: membership.tenantId,
  };
  if (membership.role === "SELLER") {
    return { ...base, lead: { assignedSellerId: membership.userId } };
  }
  return base;
}

export type EnrollmentListFilters = {
  search?: string;
  modalityId?: string;
  status?: EnrollmentStatus;
};

export function buildEnrollmentListWhere(
  membership: TenantUser,
  filters: EnrollmentListFilters,
): Prisma.EnrollmentWhereInput {
  const where: Prisma.EnrollmentWhereInput = {
    tenantId: membership.tenantId,
  };

  if (filters.modalityId) where.modalityId = filters.modalityId;
  if (filters.status) where.status = filters.status;

  // Filtros que afetam o relacionamento `lead` (search por nome + scope do
  // SELLER) são compostos no MESMO objeto pra não se sobrescreverem.
  // Tampering: SELLER passando ?seller=outra continua vendo só os seus
  // (assignedSellerId é forçado abaixo, sobrescreve qualquer querystring).
  const leadConstraint: Prisma.LeadWhereInput = {};
  if (filters.search?.trim()) {
    leadConstraint.name = { contains: filters.search.trim(), mode: "insensitive" };
  }
  if (membership.role === "SELLER") {
    leadConstraint.assignedSellerId = membership.userId;
  }
  if (Object.keys(leadConstraint).length > 0) {
    where.lead = leadConstraint;
  }

  return where;
}

export async function getEnrollmentsForList(
  membership: TenantUser,
  filters: EnrollmentListFilters = {},
) {
  return prisma.enrollment.findMany({
    where: buildEnrollmentListWhere(membership, filters),
    select: {
      id: true,
      enrolledAt: true,
      canceledAt: true,
      suspendedAt: true,
      suspensionReason: true,
      expectedReturnAt: true,
      monthlyValue: true,
      paymentMethod: true,
      status: true,
      observations: true,
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          assignedSeller: { select: { id: true, name: true, email: true } },
        },
      },
      modality: { select: { id: true, name: true, color: true } },
      plan: { select: { id: true, name: true } },
    },
    orderBy: { enrolledAt: "desc" },
  });
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

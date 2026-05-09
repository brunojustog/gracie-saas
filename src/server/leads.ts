/**
 * Camada de dados de Lead, com escopo automático por tenant + role.
 *
 * Política de visibilidade:
 *   - ADMIN, MANAGER → todos os leads do tenant
 *   - SELLER         → APENAS leads onde `assignedSellerId = user.id`
 *     (leads não-atribuídos ficam invisíveis pra SELLER; triagem é manual
 *     por ADMIN/MANAGER. Spec de auto-assignment é futuro.)
 *
 * Toda função aqui consome um `TenantUser` (membership) e injeta o filtro
 * de tenant + role automaticamente. Server Actions e Server Components
 * NUNCA devem chamar `prisma.lead.*` diretamente; sempre via estes helpers.
 */
import type { Prisma, TenantUser } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Filtro `where` que aplica isolamento de tenant + role.
 * Função pura — testável em isolamento.
 */
export function scopedLeadWhere(membership: TenantUser): Prisma.LeadWhereInput {
  const base: Prisma.LeadWhereInput = { tenantId: membership.tenantId };
  if (membership.role === "SELLER") {
    return { ...base, assignedSellerId: membership.userId };
  }
  return base;
}

export type KanbanFilters = {
  search?: string;
  modalityId?: string;
  assignedSellerId?: string;
};

/**
 * Combina o escopo da membership com filtros adicionais vindos da UI.
 * Filtros nunca conseguem AMPLIAR o escopo — só restringir dentro dele.
 *
 * Ex: SELLER tentando passar `?assignedSellerId=outro-seller` continua
 * vendo só os próprios leads (o spread garante que `scopedLeadWhere`
 * sobrescreve o filtro da UI quando há conflito… NÃO — a ordem importa).
 *
 * Ordem aplicada: filtros UI primeiro, scope depois → scope ganha.
 */
export function buildKanbanWhere(
  membership: TenantUser,
  filters: KanbanFilters,
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};

  if (filters.search?.trim()) {
    const q = filters.search.trim();
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { phone: { contains: q } },
      { email: { contains: q, mode: "insensitive" } },
    ];
  }

  if (filters.modalityId) {
    where.modalityId = filters.modalityId;
  }

  // assignedSellerId só é honrado quando o caller é ADMIN/MANAGER.
  // Pra SELLER, scopedLeadWhere fixa em si mesmo (passa por cima).
  if (filters.assignedSellerId && membership.role !== "SELLER") {
    where.assignedSellerId = filters.assignedSellerId;
  }

  return { ...where, ...scopedLeadWhere(membership) };
}

export type KanbanLead = Awaited<ReturnType<typeof getLeadsForKanban>>[number];

export async function getLeadsForKanban(
  membership: TenantUser,
  filters: KanbanFilters = {},
) {
  return prisma.lead.findMany({
    where: buildKanbanWhere(membership, filters),
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      origin: true,
      stageId: true,
      modalityId: true,
      assignedSellerId: true,
      lastInteractionAt: true,
      createdAt: true,
      modality: { select: { id: true, name: true } },
      assignedSeller: { select: { id: true, name: true, email: true } },
      enrollment: { select: { id: true, status: true } },
    },
    orderBy: { lastInteractionAt: "desc" },
  });
}

/**
 * Carrega 1 lead específico respeitando o escopo. Retorna null se o user
 * não tem permissão de ver — usado por Server Actions pra autorizar antes
 * de mutar (ex: moveLeadToStage).
 */
export async function findLeadInScope(
  membership: TenantUser,
  leadId: string,
) {
  return prisma.lead.findFirst({
    where: { id: leadId, ...scopedLeadWhere(membership) },
  });
}

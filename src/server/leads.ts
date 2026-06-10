/**
 * Camada de dados de Lead, com isolamento por tenant.
 *
 * Política de visibilidade (v1.1-O):
 *   - Qualquer role autenticada no tenant vê todos os leads do tenant.
 *     Operação real do BGAF mostrou que vendedoras atendem leads umas das
 *     outras (cobertura quando alguém está fora) — restringir por
 *     `assignedSellerId` virou atrito. `assignedSeller` continua existindo
 *     como atribuição formal (relevante pra ranking), só não filtra leitura.
 *
 * Toda função aqui consome um `TenantUser` (membership) e injeta o filtro
 * de tenant. Server Actions e Server Components NUNCA devem chamar
 * `prisma.lead.*` diretamente; sempre via estes helpers.
 */
import type { Prisma, TenantUser } from "@prisma/client";

import { prisma } from "@/lib/prisma";

/**
 * Filtro `where` que aplica isolamento de tenant + exclui soft-deletados
 * por padrão (v1.1-W). Passe `includeDeleted: true` SÓ pra cenários
 * administrativos (tela de lixeira, restauração) — o resto da app não
 * deve ver leads excluídos.
 * Função pura — testável em isolamento.
 */
export function scopedLeadWhere(
  membership: TenantUser,
  opts: { includeDeleted?: boolean } = {},
): Prisma.LeadWhereInput {
  const base: Prisma.LeadWhereInput = { tenantId: membership.tenantId };
  if (!opts.includeDeleted) {
    base.deletedAt = null;
  }
  return base;
}

export type KanbanFilters = {
  search?: string;
  modalityId?: string;
  assignedSellerId?: string;
};

/**
 * Combina o escopo da membership (tenant) com filtros vindos da UI.
 * Filtros nunca conseguem AMPLIAR o escopo — só restringir dentro dele.
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

  if (filters.assignedSellerId) {
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
      tags: true,
      lastInteractionAt: true,
      createdAt: true,
      chatwootConversationId: true,
      manychatSubscriberId: true,
      manychatIgUsername: true,
      modality: { select: { id: true, name: true } },
      assignedSeller: { select: { id: true, name: true, email: true } },
      enrollment: { select: { id: true, status: true } },
      // v1.1-X/Y: aulas futuras (SCHEDULED/CONFIRMED) usadas pra decidir
      // se drag pro stage de agendamento abre o modal ou não.
      experimentalClasses: {
        where: {
          status: { in: ["SCHEDULED", "CONFIRMED"] },
          scheduledDate: { gt: new Date() },
        },
        select: { id: true, scheduledDate: true, status: true },
        orderBy: { scheduledDate: "asc" },
        take: 1,
      },
    },
    orderBy: { lastInteractionAt: "desc" },
  });
}

/**
 * Carrega 1 lead específico respeitando o escopo de tenant. Retorna null
 * se o lead não existe ou é de outro tenant — usado por Server Actions pra
 * autorizar antes de mutar (ex: moveLeadToStage).
 */
export async function findLeadInScope(
  membership: TenantUser,
  leadId: string,
) {
  return prisma.lead.findFirst({
    where: { id: leadId, ...scopedLeadWhere(membership) },
  });
}

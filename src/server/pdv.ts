/**
 * Camada de dados da lojinha / PDV (v1.1-I).
 *
 * Política de visibilidade (espelha leads/enrollments):
 *   - ADMIN, MANAGER → todas as vendas do tenant
 *   - SELLER         → APENAS vendas onde `sellerUserId = user.id`
 *
 * Produtos são globais ao tenant (não filtram por seller — toda vendedora vê
 * o catálogo inteiro).
 *
 * Server Actions e Server Components NUNCA devem chamar `prisma.sale.*` ou
 * `prisma.product.*` direto sem checar tenant; sempre via estes helpers.
 */
import type {
  Prisma,
  ProductCategory,
  SalePaymentMethod,
  TenantUser,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";

// ──────────────────────────────────────────────────────────────────────────
// Produtos / Variants
// ──────────────────────────────────────────────────────────────────────────

export type ProductListItem = {
  id: string;
  name: string;
  category: ProductCategory;
  description: string | null;
  active: boolean;
  variants: Array<{
    id: string;
    label: string;
    sku: string | null;
    price: number;
    stock: number | null;
    active: boolean;
  }>;
};

/** Catálogo completo do tenant. Usado pelo /pdv (tela de venda) e /pdv/produtos. */
export async function getProductsForTenant(
  tenantId: string,
  opts: { onlyActive?: boolean } = {},
): Promise<ProductListItem[]> {
  const rows = await prisma.product.findMany({
    where: {
      tenantId,
      ...(opts.onlyActive ? { active: true } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      category: true,
      description: true,
      active: true,
      variants: {
        where: opts.onlyActive ? { active: true } : {},
        orderBy: { label: "asc" },
        select: {
          id: true,
          label: true,
          sku: true,
          price: true,
          stock: true,
          active: true,
        },
      },
    },
  });

  return rows.map((r) => ({
    ...r,
    variants: r.variants.map((v) => ({
      ...v,
      price: Number(v.price),
    })),
  }));
}

export async function findProductInTenant(tenantId: string, productId: string) {
  return prisma.product.findFirst({
    where: { id: productId, tenantId },
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Vendas
// ──────────────────────────────────────────────────────────────────────────

export function scopedSaleWhere(
  membership: TenantUser,
): Prisma.SaleWhereInput {
  const base: Prisma.SaleWhereInput = { tenantId: membership.tenantId };
  if (membership.role === "SELLER") {
    return { ...base, sellerUserId: membership.userId };
  }
  return base;
}

export type SaleListFilters = {
  from?: Date;
  to?: Date;
  sellerUserId?: string;
  paymentMethod?: SalePaymentMethod;
  customerLeadId?: string;
};

export function buildSaleListWhere(
  membership: TenantUser,
  filters: SaleListFilters,
): Prisma.SaleWhereInput {
  const where: Prisma.SaleWhereInput = {};

  if (filters.from || filters.to) {
    where.paidAt = {};
    if (filters.from) where.paidAt.gte = filters.from;
    if (filters.to) where.paidAt.lte = filters.to;
  }
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
  if (filters.customerLeadId) where.customerLeadId = filters.customerLeadId;

  // sellerUserId só é honrado pra ADMIN/MANAGER. Pra SELLER, scopedSaleWhere
  // sobrescreve abaixo (igual /matriculas).
  if (filters.sellerUserId && membership.role !== "SELLER") {
    where.sellerUserId = filters.sellerUserId;
  }

  return { ...where, ...scopedSaleWhere(membership) };
}

export async function getSalesForList(
  membership: TenantUser,
  filters: SaleListFilters = {},
) {
  const rows = await prisma.sale.findMany({
    where: buildSaleListWhere(membership, filters),
    orderBy: { paidAt: "desc" },
    select: {
      id: true,
      paidAt: true,
      total: true,
      paymentMethod: true,
      notes: true,
      sellerUser: { select: { id: true, name: true, email: true } },
      customerLead: { select: { id: true, name: true } },
      items: {
        select: {
          id: true,
          quantity: true,
          unitPrice: true,
          subtotal: true,
          productVariant: {
            select: {
              id: true,
              label: true,
              product: { select: { id: true, name: true } },
            },
          },
        },
      },
    },
  });

  return rows.map((r) => ({
    ...r,
    total: Number(r.total),
    items: r.items.map((i) => ({
      ...i,
      unitPrice: Number(i.unitPrice),
      subtotal: Number(i.subtotal),
    })),
  }));
}

export type SaleRow = Awaited<ReturnType<typeof getSalesForList>>[number];

/** Vendas vinculadas a um lead específico (aba "Compras" do lead sheet). */
export async function getSalesForLead(
  membership: TenantUser,
  leadId: string,
) {
  return getSalesForList(membership, { customerLeadId: leadId });
}

// ──────────────────────────────────────────────────────────────────────────
// KPIs da lojinha (dashboard)
// ──────────────────────────────────────────────────────────────────────────

export async function getPdvKpis(
  membership: TenantUser,
  period: { start: Date; end: Date },
) {
  const where = buildSaleListWhere(membership, {
    from: period.start,
    to: period.end,
  });

  const [agg, perSeller] = await Promise.all([
    prisma.sale.aggregate({
      where,
      _sum: { total: true },
      _count: { _all: true },
    }),
    // Ranking só pra ADMIN/MANAGER (SELLER já vê só as suas — ranking não faz sentido)
    membership.role === "SELLER"
      ? Promise.resolve([])
      : prisma.sale.groupBy({
          by: ["sellerUserId"],
          where,
          _sum: { total: true },
          _count: { _all: true },
          orderBy: { _sum: { total: "desc" } },
        }),
  ]);

  let sellerRanking: Array<{
    sellerUserId: string;
    sellerName: string;
    total: number;
    count: number;
  }> = [];

  if (perSeller.length > 0) {
    const users = await prisma.user.findMany({
      where: { id: { in: perSeller.map((p) => p.sellerUserId) } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    sellerRanking = perSeller.map((p) => ({
      sellerUserId: p.sellerUserId,
      sellerName: byId.get(p.sellerUserId)?.name ?? byId.get(p.sellerUserId)?.email ?? "—",
      total: Number(p._sum.total ?? 0),
      count: p._count._all,
    }));
  }

  return {
    revenue: Number(agg._sum.total ?? 0),
    salesCount: agg._count._all,
    sellerRanking,
  };
}

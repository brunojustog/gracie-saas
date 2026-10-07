/**
 * v1.2-BX: camada de dados das compras da lojinha (reunião 06/10 — D).
 * Compra = academia comprou estoque de um produto do catálogo. Ao lançar,
 * soma a quantidade ao estoque da variante e registra o preço de custo (e,
 * opcionalmente, atualiza o preço de venda). Controle de gasto × margem.
 */
import { prisma } from "@/lib/prisma";

export async function getPurchasesForTenant(tenantId: string) {
  const rows = await prisma.purchase.findMany({
    where: { tenantId },
    orderBy: { purchasedAt: "desc" },
    take: 500,
    select: {
      id: true,
      productName: true,
      variantLabel: true,
      quantity: true,
      unitCost: true,
      unitSalePrice: true,
      supplier: true,
      notes: true,
      purchasedAt: true,
    },
  });
  return rows.map((r) => ({
    ...r,
    unitCost: Number(r.unitCost),
    unitSalePrice: r.unitSalePrice != null ? Number(r.unitSalePrice) : null,
  }));
}

export type PurchaseRow = Awaited<ReturnType<typeof getPurchasesForTenant>>[number];

/** Variantes ativas do tenant pro select de compra (com estoque/preço atuais). */
export async function getVariantsForPurchase(tenantId: string) {
  const products = await prisma.product.findMany({
    where: { tenantId, active: true },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      variants: {
        where: { active: true },
        orderBy: { label: "asc" },
        select: { id: true, label: true, price: true, stock: true },
      },
    },
  });
  return products
    .filter((p) => p.variants.length > 0)
    .flatMap((p) =>
      p.variants.map((v) => ({
        variantId: v.id,
        productName: p.name,
        variantLabel: v.label,
        price: Number(v.price),
        stock: v.stock,
      })),
    );
}

// ──────────────────────────────────────────────────────────────────────────
// v1.2-BZ: insumos da academia (despesas que NÃO mexem em estoque/venda).
// ──────────────────────────────────────────────────────────────────────────

export async function getSupplyExpensesForTenant(tenantId: string) {
  const rows = await prisma.supplyExpense.findMany({
    where: { tenantId },
    orderBy: { purchasedAt: "desc" },
    take: 500,
    select: {
      id: true,
      item: true,
      category: true,
      quantity: true,
      amount: true,
      supplier: true,
      notes: true,
      purchasedAt: true,
    },
  });
  return rows.map((r) => ({ ...r, amount: Number(r.amount) }));
}

export type SupplyExpenseRow = Awaited<
  ReturnType<typeof getSupplyExpensesForTenant>
>[number];

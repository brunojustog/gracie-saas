"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

const createSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1).max(100_000),
  unitCost: z.number().nonnegative().max(1_000_000),
  unitSalePrice: z.number().nonnegative().max(1_000_000).optional().nullable(),
  supplier: z.string().max(120).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  purchasedAt: z.string().optional().nullable(),
  // Atualizar o preço de venda da variante com o informado.
  updateSalePrice: z.boolean().optional(),
});

/**
 * Lança uma compra: grava o registro, soma a quantidade ao estoque da variante
 * (se o estoque é controlado) e, se pedido, atualiza o preço de venda.
 * Gestão: ADM/gerente (custo é dado sensível). Reunião 06/10 (D).
 */
export async function createPurchase(input: unknown): Promise<Result> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "input inválido" };
  }
  const { tenant, user } = await requireRole("MANAGER");
  const d = parsed.data;

  const variant = await prisma.productVariant.findFirst({
    where: { id: d.variantId, product: { tenantId: tenant.id } },
    select: { id: true, label: true, stock: true, product: { select: { name: true } } },
  });
  if (!variant) return { ok: false, error: "produto/variante não encontrado" };

  const purchasedAt = d.purchasedAt ? new Date(`${d.purchasedAt}T12:00:00-03:00`) : new Date();
  if (Number.isNaN(purchasedAt.getTime())) return { ok: false, error: "data inválida" };

  await prisma.$transaction(async (tx) => {
    await tx.purchase.create({
      data: {
        tenantId: tenant.id,
        variantId: variant.id,
        productName: variant.product.name,
        variantLabel: variant.label,
        quantity: d.quantity,
        unitCost: d.unitCost,
        unitSalePrice: d.unitSalePrice ?? null,
        supplier: d.supplier?.trim() || null,
        notes: d.notes?.trim() || null,
        purchasedAt,
        createdById: user.id,
      },
    });
    // Soma ao estoque só se a variante controla saldo (stock != null).
    if (variant.stock != null) {
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { stock: variant.stock + d.quantity },
      });
    }
    // Atualiza o preço de venda, se pedido e informado.
    if (d.updateSalePrice && d.unitSalePrice != null) {
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { price: d.unitSalePrice },
      });
    }
  });

  revalidatePath("/pdv/compras");
  revalidatePath("/pdv/produtos");
  revalidatePath("/pdv");
  return { ok: true };
}

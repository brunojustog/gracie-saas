"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

const PRODUCT_CATEGORIES = [
  "BEBIDA", "SUPLEMENTO", "ALIMENTOS", "KIMONO", "FAIXA",
  "CAMISETA", "RASHGUARD", "BERMUDA_SHORT", "ACESSORIO", "OUTRO",
] as const;

const createSchema = z
  .object({
    // Produto existente…
    variantId: z.string().min(1).optional().nullable(),
    // …ou produto novo criado na própria compra (v1.2-BY).
    newProduct: z
      .object({
        name: z.string().min(1).max(120),
        category: z.enum(PRODUCT_CATEGORIES).default("OUTRO"),
        label: z.string().max(60).optional().nullable(),
        salePrice: z.number().nonnegative().max(1_000_000).optional().nullable(),
      })
      .optional()
      .nullable(),
    quantity: z.number().int().min(1).max(100_000),
    unitCost: z.number().nonnegative().max(1_000_000),
    unitSalePrice: z.number().nonnegative().max(1_000_000).optional().nullable(),
    supplier: z.string().max(120).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
    purchasedAt: z.string().optional().nullable(),
    // Atualizar o preço de venda da variante com o informado.
    updateSalePrice: z.boolean().optional(),
  })
  .refine((d) => !!d.variantId || !!d.newProduct, {
    message: "escolha um produto ou cadastre um novo",
  });

/**
 * Lança uma compra: grava o registro, soma a quantidade ao estoque da variante
 * (se o estoque é controlado) e, se pedido, atualiza o preço de venda. Pode
 * CRIAR o produto na própria compra (newProduct). Gestão: ADM/gerente (custo é
 * dado sensível). Reunião 06/10 (D) + ajustes 07/10.
 */
export async function createPurchase(input: unknown): Promise<Result> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "input inválido" };
  }
  const { tenant, user } = await requireRole("MANAGER");
  const d = parsed.data;

  const purchasedAt = d.purchasedAt ? new Date(`${d.purchasedAt}T12:00:00-03:00`) : new Date();
  if (Number.isNaN(purchasedAt.getTime())) return { ok: false, error: "data inválida" };

  // Resolve a variante: existente ou criada agora.
  let variant: { id: string; label: string; stock: number | null; productName: string };
  let justCreated = false;
  if (d.newProduct) {
    const salePrice = d.newProduct.salePrice ?? d.unitSalePrice ?? 0;
    const created = await prisma.product.create({
      data: {
        tenantId: tenant.id,
        name: d.newProduct.name.trim(),
        category: d.newProduct.category,
        variants: {
          create: [{ label: d.newProduct.label?.trim() || "Padrão", price: salePrice, stock: d.quantity }],
        },
      },
      select: { name: true, variants: { select: { id: true, label: true, stock: true } } },
    });
    const v = created.variants[0];
    variant = { id: v.id, label: v.label, stock: v.stock, productName: created.name };
    justCreated = true; // estoque já nasceu com a quantidade comprada
  } else {
    const found = await prisma.productVariant.findFirst({
      where: { id: d.variantId!, product: { tenantId: tenant.id } },
      select: { id: true, label: true, stock: true, product: { select: { name: true } } },
    });
    if (!found) return { ok: false, error: "produto/variante não encontrado" };
    variant = { id: found.id, label: found.label, stock: found.stock, productName: found.product.name };
  }

  await prisma.$transaction(async (tx) => {
    await tx.purchase.create({
      data: {
        tenantId: tenant.id,
        variantId: variant.id,
        productName: variant.productName,
        variantLabel: variant.label,
        quantity: d.quantity,
        unitCost: d.unitCost,
        unitSalePrice: d.unitSalePrice ?? d.newProduct?.salePrice ?? null,
        supplier: d.supplier?.trim() || null,
        notes: d.notes?.trim() || null,
        purchasedAt,
        createdById: user.id,
      },
    });
    // Soma ao estoque só se a variante controla saldo e não acabou de nascer
    // já com a quantidade.
    if (!justCreated && variant.stock != null) {
      await tx.productVariant.update({
        where: { id: variant.id },
        data: { stock: variant.stock + d.quantity },
      });
    }
    // Atualiza o preço de venda, se pedido e informado (só produto existente).
    if (!justCreated && d.updateSalePrice && d.unitSalePrice != null) {
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

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { findLeadInScope } from "@/server/leads";
import { findProductInTenant, getSalesForLead } from "@/server/pdv";
import { requireRole, requireTenantUser } from "@/server/tenant";

// ──────────────────────────────────────────────────────────────────────────
// Registrar venda (todos os roles)
// ──────────────────────────────────────────────────────────────────────────

const saleItemSchema = z.object({
  productVariantId: z.string().min(1),
  quantity: z.number().int().positive().max(1000),
});

const createSaleSchema = z.object({
  items: z.array(saleItemSchema).min(1).max(100),
  paymentMethod: z.enum([
    "PIX",
    "DINHEIRO",
    "CARTAO_DEBITO",
    "CARTAO_CREDITO",
    "CORTESIA",
    "OUTRO",
  ]),
  customerLeadId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional(),
});

type SaleResult =
  | { ok: true; saleId: string }
  | { ok: false; error: string };

export async function createSale(input: unknown): Promise<SaleResult> {
  const parsed = createSaleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();

  // 1. Carrega as variants do tenant em UMA query (defesa contra tampering).
  const variantIds = parsed.data.items.map((i) => i.productVariantId);
  const variants = await prisma.productVariant.findMany({
    where: {
      id: { in: variantIds },
      active: true,
      product: { tenantId: tenant.id, active: true },
    },
    select: { id: true, price: true, stock: true, label: true, product: { select: { name: true } } },
  });
  if (variants.length !== variantIds.length) {
    return { ok: false, error: "produto inválido ou inativo" };
  }
  const variantById = new Map(variants.map((v) => [v.id, v]));

  // 2. Valida estoque + monta itens com snapshot de preço.
  type LineDraft = {
    productVariantId: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    stock: number | null;
  };
  const lines: LineDraft[] = [];
  for (const item of parsed.data.items) {
    const v = variantById.get(item.productVariantId)!;
    const unitPrice = Number(v.price);
    if (unitPrice <= 0) {
      return {
        ok: false,
        error: `${v.product.name} (${v.label}) sem preço cadastrado`,
      };
    }
    if (v.stock !== null && v.stock < item.quantity) {
      return {
        ok: false,
        error: `${v.product.name} (${v.label}): estoque insuficiente (${v.stock} disponível)`,
      };
    }
    lines.push({
      productVariantId: v.id,
      quantity: item.quantity,
      unitPrice,
      subtotal: unitPrice * item.quantity,
      stock: v.stock,
    });
  }
  const total = lines.reduce((s, l) => s + l.subtotal, 0);

  // 3. Customer lead opcional: valida que pertence ao tenant.
  let customerLeadId: string | null = null;
  if (parsed.data.customerLeadId) {
    const lead = await prisma.lead.findFirst({
      where: { id: parsed.data.customerLeadId, tenantId: tenant.id },
      select: { id: true },
    });
    if (!lead) return { ok: false, error: "lead inválido" };
    customerLeadId = lead.id;
  }

  // 4. Cria venda + items + decrementa estoque atomicamente.
  const sale = await prisma.$transaction(async (tx) => {
    const created = await tx.sale.create({
      data: {
        tenantId: tenant.id,
        sellerUserId: user.id,
        customerLeadId,
        total,
        paymentMethod: parsed.data.paymentMethod,
        notes: parsed.data.notes ?? null,
        items: {
          create: lines.map((l) => ({
            productVariantId: l.productVariantId,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            subtotal: l.subtotal,
          })),
        },
      },
      select: { id: true },
    });

    // Decrementa estoque apenas das variants com stock != null.
    for (const l of lines) {
      if (l.stock === null) continue;
      await tx.productVariant.update({
        where: { id: l.productVariantId },
        data: { stock: { decrement: l.quantity } },
      });
    }

    return created;
  });

  revalidatePath("/pdv");
  revalidatePath("/pdv/historico");
  revalidatePath("/pdv/produtos");
  revalidatePath("/dashboard");
  if (membership.role !== "SELLER") {
    revalidatePath("/admin");
  }
  return { ok: true, saleId: sale.id };
}

// ──────────────────────────────────────────────────────────────────────────
// CRUD de Produto/Variant (ADMIN/MANAGER)
// ──────────────────────────────────────────────────────────────────────────

const upsertProductSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  category: z.enum([
    "BEBIDA",
    "SUPLEMENTO",
    "KIMONO",
    "FAIXA",
    "CAMISETA",
    "RASHGUARD",
    "BERMUDA_SHORT",
    "ACESSORIO",
    "OUTRO",
  ]),
  description: z.string().max(500).optional(),
  active: z.boolean().default(true),
});

export async function upsertProduct(input: unknown) {
  const parsed = upsertProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "input inválido" };

  const { tenant } = await requireRole("MANAGER");

  if (parsed.data.id) {
    const existing = await findProductInTenant(tenant.id, parsed.data.id);
    if (!existing) return { ok: false as const, error: "produto não encontrado" };
    const updated = await prisma.product.update({
      where: { id: existing.id },
      data: {
        name: parsed.data.name,
        category: parsed.data.category,
        description: parsed.data.description ?? null,
        active: parsed.data.active,
      },
    });
    revalidatePath("/pdv/produtos");
    revalidatePath("/pdv");
    return { ok: true as const, productId: updated.id };
  }

  const created = await prisma.product.create({
    data: {
      tenantId: tenant.id,
      name: parsed.data.name,
      category: parsed.data.category,
      description: parsed.data.description ?? null,
      active: parsed.data.active,
      // Variant placeholder pra produto novo sem variação
      variants: { create: [{ label: "Padrão", price: 0, stock: null }] },
    },
  });
  revalidatePath("/pdv/produtos");
  revalidatePath("/pdv");
  return { ok: true as const, productId: created.id };
}

const upsertVariantSchema = z.object({
  id: z.string().optional(),
  productId: z.string().min(1),
  label: z.string().min(1).max(60),
  sku: z.string().max(60).optional().nullable(),
  price: z.number().nonnegative().max(1_000_000),
  /** null = ilimitado; integer >= 0 = saldo controlado. */
  stock: z.number().int().min(0).max(1_000_000).optional().nullable(),
  active: z.boolean().default(true),
});

export async function upsertVariant(input: unknown) {
  const parsed = upsertVariantSchema.safeParse(input);
  if (!parsed.success) return { ok: false as const, error: "input inválido" };

  const { tenant } = await requireRole("MANAGER");

  const product = await findProductInTenant(tenant.id, parsed.data.productId);
  if (!product) return { ok: false as const, error: "produto não encontrado" };

  if (parsed.data.id) {
    // Garante que a variant pertence ao product do tenant
    const existing = await prisma.productVariant.findFirst({
      where: { id: parsed.data.id, productId: product.id },
      select: { id: true },
    });
    if (!existing) return { ok: false as const, error: "variante não encontrada" };

    await prisma.productVariant.update({
      where: { id: existing.id },
      data: {
        label: parsed.data.label,
        sku: parsed.data.sku ?? null,
        price: parsed.data.price,
        stock: parsed.data.stock ?? null,
        active: parsed.data.active,
      },
    });
  } else {
    await prisma.productVariant.create({
      data: {
        productId: product.id,
        label: parsed.data.label,
        sku: parsed.data.sku ?? null,
        price: parsed.data.price,
        stock: parsed.data.stock ?? null,
        active: parsed.data.active,
      },
    });
  }

  revalidatePath("/pdv/produtos");
  revalidatePath("/pdv");
  return { ok: true as const };
}

// ──────────────────────────────────────────────────────────────────────────
// Vendas vinculadas a um lead (aba "Compras" do LeadSheet)
// ──────────────────────────────────────────────────────────────────────────

export async function getSalesForLeadAction(leadId: string) {
  const { membership } = await requireTenantUser();
  const lead = await findLeadInScope(membership, leadId);
  if (!lead) return null;
  return getSalesForLead(membership, lead.id);
}

export async function deleteVariant(input: { variantId: string }) {
  const { tenant } = await requireRole("MANAGER");

  const variant = await prisma.productVariant.findFirst({
    where: {
      id: input.variantId,
      product: { tenantId: tenant.id },
    },
    select: { id: true, _count: { select: { saleItems: true } } },
  });
  if (!variant) return { ok: false as const, error: "variante não encontrada" };
  if (variant._count.saleItems > 0) {
    return {
      ok: false as const,
      error: "variante tem vendas registradas — desative em vez de excluir",
    };
  }

  await prisma.productVariant.delete({ where: { id: variant.id } });
  revalidatePath("/pdv/produtos");
  revalidatePath("/pdv");
  return { ok: true as const };
}

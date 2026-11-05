"use server";

import type { Prisma, SalePaymentMethod } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { findOrderInTenant } from "@/server/orders";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

// Formas de pagamento aceitas num pagamento de encomenda (vira Sale).
const SALE_PAY = ["PIX", "DINHEIRO", "CARTAO_DEBITO", "CARTAO_CREDITO", "CORTESIA", "OUTRO"] as const;

// v1.2-BS: campos da encomenda (planilha Pedidos_de_venda), preenchidos pelo vendedor.
const orderFields = {
  item: z.string().min(1, "descreva o item").max(200),
  quantity: z.number().int().min(1).max(9999).optional(),
  matricula: z.string().max(40).optional().nullable(),
  customerName: z.string().max(120).optional().nullable(),
  // v1.2-CC: aluno vinculado (pro débito do saldo ir na ficha dele).
  customerLeadId: z.string().min(1).optional().nullable(),
  size: z.string().max(40).optional().nullable(),
  progress: z.string().max(120).optional().nullable(),
  paymentStatus: z.enum(["TO_PAY", "PARTIAL", "PAID"]).default("TO_PAY"),
  paymentMethod: z.string().max(40).optional().nullable(),
  amount: z.number().nonnegative().max(1_000_000).optional().nullable(),
  // v1.2-BY: custo da encomenda (p/ lucro por venda).
  cost: z.number().nonnegative().max(1_000_000).optional().nullable(),
  // v1.2-CC: combinado/forma do pagamento do restante ("2x", "toda sexta"...).
  paymentPlan: z.string().max(200).optional().nullable(),
  pickupAt: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  // v1.2-BX: encomenda de brinde (saída de kimono de matrícula).
  isGift: z.boolean().optional(),
  // v1.2-CJ: produto do estoque vinculado (opcional). Ao entregar, baixa este
  // produto do estoque. null = item avulso (texto livre, sem baixa).
  variantId: z.string().min(1).optional().nullable(),
};

/** "YYYY-MM-DD" → Date no meio-dia BR (evita shift de fuso). null/'' → null. */
function parseDay(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T12:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Valida que o lead é do tenant e devolve id+nome (snapshot). */
async function resolveLead(tenantId: string, leadId: string | null | undefined) {
  if (!leadId) return { id: null as string | null, name: null as string | null };
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, tenantId },
    select: { id: true, name: true },
  });
  return { id: lead?.id ?? null, name: lead?.name ?? null };
}

/** v1.2-CJ: valida que a variante é do tenant; devolve o id ou null. */
async function resolveVariant(tenantId: string, variantId: string | null | undefined) {
  if (!variantId) return null;
  const v = await prisma.productVariant.findFirst({
    where: { id: variantId, product: { tenantId } },
    select: { id: true },
  });
  return v?.id ?? null;
}

/**
 * v1.2-CK: soma `delta` (pode ser negativo) ao estoque da variante. Só mexe se
 * o saldo for CONTROLADO (stock != null); estoque ilimitado não altera. Piso 0.
 * Devolve true se mexeu (pra saber se registra a quantidade aplicada).
 */
async function moveVariantStock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  variantId: string,
  delta: number,
): Promise<boolean> {
  if (delta === 0) return false;
  const v = await tx.productVariant.findFirst({
    where: { id: variantId, product: { tenantId } },
    select: { id: true, stock: true },
  });
  if (!v || v.stock == null) return false; // sem variante ou estoque ilimitado
  await tx.productVariant.update({
    where: { id: v.id },
    data: { stock: Math.max(0, v.stock + delta) },
  });
  return true;
}

/**
 * v1.2-CK: quantidade que a encomenda mantém NO estoque da unidade por etapa.
 * "Chegou" (ARRIVED) e "Troca" (EXCHANGE) = item está na unidade (+qtd).
 * "Entregue" saiu; "Pedido/Encomendado" ainda não chegou → 0.
 */
function stockTargetForStage(stage: string, qty: number): number {
  return stage === "ARRIVED" || stage === "EXCHANGE" ? qty : 0;
}

/**
 * v1.2-CK: reconcilia o estoque da encomenda. Desfaz o que estava aplicado
 * (na variante/qtd antigas) e aplica o alvo da etapa nova na variante nova.
 * Devolve a nova quantidade aplicada (0 se item avulso ou estoque ilimitado).
 */
async function reconcileOrderStock(
  tx: Prisma.TransactionClient,
  tenantId: string,
  cur: { variantId: string | null; stockApplied: number },
  next: { stage: string; variantId: string | null; quantity: number },
): Promise<number> {
  if (cur.stockApplied !== 0 && cur.variantId) {
    await moveVariantStock(tx, tenantId, cur.variantId, -cur.stockApplied);
  }
  const target = next.variantId ? stockTargetForStage(next.stage, next.quantity) : 0;
  if (next.variantId && target !== 0) {
    const moved = await moveVariantStock(tx, tenantId, next.variantId, target);
    return moved ? target : 0;
  }
  return 0;
}

/**
 * v1.2-CC: registra um pagamento (total/parcial) de uma encomenda como VENDA da
 * lojinha (Sale com orderId) — entra no caixa/histórico — e recalcula o
 * paymentStatus da encomenda (pago vs amount). Roda dentro de uma transação.
 */
async function recordOrderPaymentTx(
  tx: Prisma.TransactionClient,
  args: {
    order: { id: string; item: string; amount: unknown; customerLeadId: string | null; customerName: string | null };
    amount: number;
    method: SalePaymentMethod;
    paidAt: Date;
    sellerUserId: string;
    tenantId: string;
    note?: string | null;
  },
) {
  await tx.sale.create({
    data: {
      tenantId: args.tenantId,
      sellerUserId: args.sellerUserId,
      customerLeadId: args.order.customerLeadId,
      customerName: args.order.customerName,
      total: args.amount,
      discount: 0,
      paymentMethod: args.method,
      paidAt: args.paidAt,
      orderId: args.order.id,
      notes: args.note?.trim() || `Encomenda: ${args.order.item}`,
    },
  });

  // Recalcula o status a partir do total pago (todas as vendas da encomenda).
  const agg = await tx.sale.aggregate({
    where: { orderId: args.order.id },
    _sum: { total: true },
  });
  const paid = Number(agg._sum.total ?? 0);
  const amount = args.order.amount != null ? Number(args.order.amount) : null;
  const status: "TO_PAY" | "PARTIAL" | "PAID" =
    amount == null
      ? paid > 0 ? "PAID" : "TO_PAY"
      : paid >= amount ? "PAID" : paid > 0 ? "PARTIAL" : "TO_PAY";
  await tx.order.update({ where: { id: args.order.id }, data: { paymentStatus: status } });
}

const createSchema = z.object({
  ...orderFields,
  orderedAt: z.string().optional().nullable(),
  // v1.2-CC: "já deixar pago" na hora da encomenda (total ou parcial).
  payNow: z
    .object({
      amount: z.number().positive().max(1_000_000),
      method: z.enum(SALE_PAY),
      paidAt: z.string().optional().nullable(),
    })
    .optional()
    .nullable(),
});

export async function createOrder(input: unknown): Promise<Result> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "input inválido" };
  }
  const { tenant, user } = await requireRole("SELLER");
  const d = parsed.data;

  const orderedAt = d.orderedAt ? new Date(d.orderedAt) : new Date();
  if (Number.isNaN(orderedAt.getTime())) return { ok: false, error: "data inválida" };

  // Aluno vinculado (snapshot do nome tem prioridade pro customerName).
  const lead = await resolveLead(tenant.id, d.customerLeadId);
  if (d.customerLeadId && !lead.id) return { ok: false, error: "aluno inválido" };
  const variantId = await resolveVariant(tenant.id, d.variantId);
  const amount = d.isGift ? null : d.amount ?? null;

  await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        tenantId: tenant.id,
        item: d.item.trim(),
        quantity: d.quantity ?? 1,
        matricula: d.matricula?.trim() || null,
        customerName: lead.name ?? (d.customerName?.trim() || null),
        customerLeadId: lead.id,
        size: d.size?.trim() || null,
        progress: d.progress?.trim() || null,
        paymentStatus: d.paymentStatus,
        paymentMethod: d.paymentMethod?.trim() || null,
        amount,
        cost: d.cost ?? null,
        paymentPlan: d.paymentPlan?.trim() || null,
        pickupAt: parseDay(d.pickupAt),
        notes: d.notes?.trim() || null,
        isGift: d.isGift ?? false,
        variantId,
        orderedAt,
        createdById: user.id,
      },
      select: { id: true, item: true, amount: true, customerLeadId: true, customerName: true },
    });

    // v1.2-CC: "já deixar pago" — lança o pagamento como venda da lojinha.
    if (d.payNow && !d.isGift) {
      await recordOrderPaymentTx(tx, {
        order,
        amount: d.payNow.amount,
        method: d.payNow.method,
        paidAt: parseDay(d.payNow.paidAt) ?? new Date(),
        sellerUserId: user.id,
        tenantId: tenant.id,
      });
    }
  });

  revalidatePath("/pdv/encomendas");
  revalidatePath("/pdv/historico");
  revalidatePath("/pdv");
  return { ok: true };
}

const updateSchema = z.object({ id: z.string().min(1), ...orderFields });

export async function updateOrder(input: unknown): Promise<Result> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "input inválido" };
  }
  const { tenant } = await requireRole("SELLER");
  const d = parsed.data;

  // v1.2-CJ/CK: precisa do estado atual (variante/qtd/estágio/aplicado) pra
  // reconciliar o estoque se o produto ou a quantidade mudarem.
  const cur = await prisma.order.findFirst({
    where: { id: d.id, tenantId: tenant.id },
    select: { id: true, variantId: true, quantity: true, stage: true, stockApplied: true },
  });
  if (!cur) return { ok: false, error: "encomenda não encontrada" };

  const lead = await resolveLead(tenant.id, d.customerLeadId);
  if (d.customerLeadId && !lead.id) return { ok: false, error: "aluno inválido" };
  const newVariantId = await resolveVariant(tenant.id, d.variantId);
  const newQty = d.quantity ?? 1;

  await prisma.$transaction(async (tx) => {
    const stockApplied = await reconcileOrderStock(
      tx,
      tenant.id,
      { variantId: cur.variantId, stockApplied: cur.stockApplied },
      { stage: cur.stage, variantId: newVariantId, quantity: newQty },
    );
    await tx.order.update({
      where: { id: cur.id },
      data: {
        item: d.item.trim(),
        quantity: newQty,
        matricula: d.matricula?.trim() || null,
        customerName: lead.name ?? (d.customerName?.trim() || null),
        customerLeadId: lead.id,
        size: d.size?.trim() || null,
        progress: d.progress?.trim() || null,
        // paymentStatus é derivado dos pagamentos; só respeita o manual se não há
        // pagamentos registrados ainda (mantém compat com encomendas antigas).
        paymentMethod: d.paymentMethod?.trim() || null,
        amount: d.isGift ? null : d.amount ?? null,
        cost: d.cost ?? null,
        paymentPlan: d.paymentPlan?.trim() || null,
        pickupAt: parseDay(d.pickupAt),
        notes: d.notes?.trim() || null,
        isGift: d.isGift ?? false,
        variantId: newVariantId,
        stockApplied,
      },
    });
  });

  revalidatePath("/pdv/encomendas");
  revalidatePath("/pdv/produtos");
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// v1.2-CC: lançar pagamento (total/parcial) de uma encomenda. Vira venda da
// lojinha (caixa/histórico) e recalcula o saldo (débito) da encomenda.
// ──────────────────────────────────────────────────────────────────────────

const paymentSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().positive().max(1_000_000),
  method: z.enum(SALE_PAY),
  paidAt: z.string().optional().nullable(),
  note: z.string().max(500).optional().nullable(),
});

export async function addOrderPayment(input: unknown): Promise<Result> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "input inválido" };
  }
  const { tenant, user } = await requireRole("SELLER");
  const d = parsed.data;

  const order = await prisma.order.findFirst({
    where: { id: d.orderId, tenantId: tenant.id },
    select: { id: true, item: true, amount: true, customerLeadId: true, customerName: true, isGift: true },
  });
  if (!order) return { ok: false, error: "encomenda não encontrada" };
  if (order.isGift) return { ok: false, error: "encomenda de brinde não tem pagamento" };

  await prisma.$transaction(async (tx) => {
    await recordOrderPaymentTx(tx, {
      order,
      amount: d.amount,
      method: d.method,
      paidAt: parseDay(d.paidAt) ?? new Date(),
      sellerUserId: user.id,
      tenantId: tenant.id,
      note: d.note,
    });
  });

  revalidatePath("/pdv/encomendas");
  revalidatePath("/pdv/historico");
  revalidatePath("/pdv");
  if (order.customerLeadId) {
    revalidatePath("/settings/alunos");
  }
  return { ok: true };
}

const statusSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["OPEN", "FULFILLED", "CANCELED"]),
});

export async function updateOrderStatus(input: unknown): Promise<Result> {
  const parsed = statusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("SELLER");

  const found = await findOrderInTenant(tenant.id, parsed.data.id);
  if (!found) return { ok: false, error: "encomenda não encontrada" };

  await prisma.order.update({
    where: { id: found.id },
    data: { status: parsed.data.status },
  });
  revalidatePath("/pdv/encomendas");
  return { ok: true };
}

// v1.2-BX: avança a etapa do processo de venda (Kanban). DELIVERED também
// marca a encomenda como entregue (status FULFILLED) pra fechar o ciclo;
// qualquer outra etapa reabre (OPEN).
const stageSchema = z.object({
  id: z.string().min(1),
  stage: z.enum(["REQUESTED", "ORDERED", "ARRIVED", "DELIVERED", "EXCHANGE"]),
});

export async function setOrderStage(input: unknown): Promise<Result> {
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("SELLER");

  const order = await prisma.order.findFirst({
    where: { id: parsed.data.id, tenantId: tenant.id },
    select: { id: true, variantId: true, quantity: true, stockApplied: true },
  });
  if (!order) return { ok: false, error: "encomenda não encontrada" };

  const toDelivered = parsed.data.stage === "DELIVERED";

  await prisma.$transaction(async (tx) => {
    // v1.2-CK: reconcilia o estoque pela etapa nova. Chegou → entrada (+qtd);
    // Entregue → saída (volta a 0); outras etapas ajustam conforme o alvo.
    const stockApplied = await reconcileOrderStock(
      tx,
      tenant.id,
      { variantId: order.variantId, stockApplied: order.stockApplied },
      { stage: parsed.data.stage, variantId: order.variantId, quantity: order.quantity },
    );
    await tx.order.update({
      where: { id: order.id },
      data: {
        stage: parsed.data.stage,
        status: toDelivered ? "FULFILLED" : "OPEN",
        stockApplied,
      },
    });
  });

  revalidatePath("/pdv/encomendas");
  revalidatePath("/pdv/produtos");
  revalidatePath("/pdv");
  return { ok: true };
}

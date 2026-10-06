"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { findOrderInTenant } from "@/server/orders";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

// v1.2-BS: campos da encomenda (planilha Pedidos_de_venda), preenchidos pelo vendedor.
const orderFields = {
  item: z.string().min(1, "descreva o item").max(200),
  quantity: z.number().int().min(1).max(9999).optional(),
  matricula: z.string().max(40).optional().nullable(),
  customerName: z.string().max(120).optional().nullable(),
  size: z.string().max(40).optional().nullable(),
  progress: z.string().max(120).optional().nullable(),
  paymentStatus: z.enum(["TO_PAY", "PARTIAL", "PAID"]).default("TO_PAY"),
  paymentMethod: z.string().max(40).optional().nullable(),
  amount: z.number().nonnegative().max(1_000_000).optional().nullable(),
  pickupAt: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  // v1.2-BX: encomenda de brinde (saída de kimono de matrícula).
  isGift: z.boolean().optional(),
};

/** "YYYY-MM-DD" → Date no meio-dia BR (evita shift de fuso). null/'' → null. */
function parseDay(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(`${s}T12:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

const createSchema = z.object({
  ...orderFields,
  orderedAt: z.string().optional().nullable(),
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

  await prisma.order.create({
    data: {
      tenantId: tenant.id,
      item: d.item.trim(),
      quantity: d.quantity ?? 1,
      matricula: d.matricula?.trim() || null,
      customerName: d.customerName?.trim() || null,
      size: d.size?.trim() || null,
      progress: d.progress?.trim() || null,
      paymentStatus: d.paymentStatus,
      paymentMethod: d.paymentMethod?.trim() || null,
      amount: d.isGift ? null : d.amount ?? null,
      pickupAt: parseDay(d.pickupAt),
      notes: d.notes?.trim() || null,
      isGift: d.isGift ?? false,
      orderedAt,
      createdById: user.id,
    },
  });

  revalidatePath("/pdv/encomendas");
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

  const found = await findOrderInTenant(tenant.id, d.id);
  if (!found) return { ok: false, error: "encomenda não encontrada" };

  await prisma.order.update({
    where: { id: found.id },
    data: {
      item: d.item.trim(),
      quantity: d.quantity ?? 1,
      matricula: d.matricula?.trim() || null,
      customerName: d.customerName?.trim() || null,
      size: d.size?.trim() || null,
      progress: d.progress?.trim() || null,
      paymentStatus: d.paymentStatus,
      paymentMethod: d.paymentMethod?.trim() || null,
      amount: d.isGift ? null : d.amount ?? null,
      pickupAt: parseDay(d.pickupAt),
      notes: d.notes?.trim() || null,
      isGift: d.isGift ?? false,
    },
  });

  revalidatePath("/pdv/encomendas");
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

  const found = await findOrderInTenant(tenant.id, parsed.data.id);
  if (!found) return { ok: false, error: "encomenda não encontrada" };

  await prisma.order.update({
    where: { id: found.id },
    data: {
      stage: parsed.data.stage,
      status: parsed.data.stage === "DELIVERED" ? "FULFILLED" : "OPEN",
    },
  });
  revalidatePath("/pdv/encomendas");
  return { ok: true };
}

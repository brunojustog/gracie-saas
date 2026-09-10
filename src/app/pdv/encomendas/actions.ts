"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { findOrderInTenant } from "@/server/orders";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

const createSchema = z.object({
  item: z.string().min(1, "descreva o item").max(200),
  customerName: z.string().max(120).optional().nullable(),
  size: z.string().max(40).optional().nullable(),
  paymentStatus: z.enum(["TO_PAY", "PARTIAL", "PAID"]).default("TO_PAY"),
  amount: z.number().nonnegative().max(1_000_000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
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
  if (Number.isNaN(orderedAt.getTime())) {
    return { ok: false, error: "data inválida" };
  }

  await prisma.order.create({
    data: {
      tenantId: tenant.id,
      item: d.item.trim(),
      customerName: d.customerName?.trim() || null,
      size: d.size?.trim() || null,
      paymentStatus: d.paymentStatus,
      amount: d.amount ?? null,
      notes: d.notes?.trim() || null,
      orderedAt,
      createdById: user.id,
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

const paymentSchema = z.object({
  id: z.string().min(1),
  paymentStatus: z.enum(["TO_PAY", "PARTIAL", "PAID"]),
  amount: z.number().nonnegative().max(1_000_000).optional().nullable(),
});

export async function updateOrderPayment(input: unknown): Promise<Result> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("SELLER");

  const found = await findOrderInTenant(tenant.id, parsed.data.id);
  if (!found) return { ok: false, error: "encomenda não encontrada" };

  await prisma.order.update({
    where: { id: found.id },
    data: {
      paymentStatus: parsed.data.paymentStatus,
      ...(parsed.data.amount !== undefined ? { amount: parsed.data.amount } : {}),
    },
  });
  revalidatePath("/pdv/encomendas");
  return { ok: true };
}

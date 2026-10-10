"use server";

import type { PaymentMethod } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { findEnrollmentInScope } from "@/server/enrollments";
import { requireTenantUser } from "@/server/tenant";

export type PaymentHistoryRow = {
  id: string;
  paidAt: Date;
  dueDate: Date | null;
  amount: number;
  method: PaymentMethod | null;
  notes: string | null;
  confirmedBy: string | null;
};

/**
 * v1.2-CD: histórico completo de pagamentos de uma matrícula (desde a
 * matrícula), pro botão "Histórico" no financeiro. Lazy-load ao abrir.
 */
export async function getEnrollmentPaymentHistory(
  enrollmentId: string,
): Promise<PaymentHistoryRow[]> {
  const { membership } = await requireTenantUser();
  const enr = await findEnrollmentInScope(membership, enrollmentId);
  if (!enr) return [];

  const rows = await prisma.paymentRecord.findMany({
    where: { enrollmentId: enr.id },
    orderBy: { paidAt: "desc" },
    take: 300,
    select: {
      id: true,
      paidAt: true,
      dueDate: true,
      amount: true,
      method: true,
      notes: true,
      confirmedBy: { select: { name: true, email: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    paidAt: r.paidAt,
    dueDate: r.dueDate,
    amount: Number(r.amount),
    method: r.method,
    notes: r.notes,
    confirmedBy: r.confirmedBy?.name ?? r.confirmedBy?.email ?? null,
  }));
}

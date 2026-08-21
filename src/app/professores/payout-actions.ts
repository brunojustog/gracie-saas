"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

/** v1.2-P: admin marca/desmarca "Pago" num fechamento mensal do professor. */
export async function togglePaid(input: unknown): Promise<Result> {
  const parsed = z
    .object({ payoutId: z.string().min(1), paid: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  const payout = await prisma.professorPayout.findFirst({
    where: { id: parsed.data.payoutId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!payout) return { ok: false, error: "fechamento não encontrado" };

  await prisma.professorPayout.update({
    where: { id: payout.id },
    data: { paidAt: parsed.data.paid ? new Date() : null },
  });
  revalidatePath("/professores");
  revalidatePath("/professor");
  return { ok: true };
}

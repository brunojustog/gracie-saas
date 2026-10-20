"use server";

import type { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { validSlotSet } from "@/server/graduation-exams";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

const bookSchema = z.object({
  scheduledAt: z.string().min(1),
  alunoId: z.string().min(1),
  targetBelt: z.string().max(40).optional().nullable(),
  targetBeltDegree: z.number().int().min(0).max(6).optional().nullable(),
  beltSize: z.string().max(20).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
});

export async function bookExam(input: unknown): Promise<Result> {
  const parsed = bookSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant, user } = await requireRole("SELLER");
  const d = parsed.data;

  const at = new Date(d.scheduledAt);
  if (Number.isNaN(at.getTime())) return { ok: false, error: "horário inválido" };
  // Só aceita um dos horários fixos da janela.
  if (!validSlotSet().has(at.toISOString())) {
    return { ok: false, error: "horário fora da grade de provas" };
  }

  const aluno = await prisma.aluno.findFirst({
    where: { id: d.alunoId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!aluno) return { ok: false, error: "aluno não encontrado" };

  // v1.2-BN: tamanho da faixa fica no cadastro do aluno (reusa nas graduações).
  if (d.beltSize !== undefined) {
    await prisma.aluno.update({
      where: { id: aluno.id },
      data: { beltSize: d.beltSize?.trim() || null },
    });
  }

  try {
    await prisma.graduationExam.create({
      data: {
        tenantId: tenant.id,
        alunoId: aluno.id,
        scheduledAt: at,
        targetBelt: d.targetBelt?.trim() || null,
        targetBeltDegree: d.targetBeltDegree ?? null,
        notes: d.notes?.trim() || null,
        createdById: user.id,
      },
    });
  } catch {
    // unique (tenantId, scheduledAt) — corrida: alguém pegou o horário.
    return { ok: false, error: "esse horário acabou de ser ocupado" };
  }

  revalidatePath("/graduacao");
  revalidatePath("/professor/provas");
  return { ok: true };
}

const PAYMENT = ["CREDIT_CARD", "PIX", "BOLETO", "CASH", "TRANSFER", "OTHER"] as const;
type Payment = (typeof PAYMENT)[number];

/** PaymentMethod → SalePaymentMethod (pra lançar a venda da graduação). v1.2-CG. */
function saleMethod(pm: Payment | null | undefined): "PIX" | "DINHEIRO" | "CARTAO_CREDITO" | "OUTRO" {
  switch (pm) {
    case "PIX": return "PIX";
    case "CASH": return "DINHEIRO";
    case "CREDIT_CARD": return "CARTAO_CREDITO";
    default: return "OUTRO";
  }
}

/** "YYYY-MM-DD" → Date meio-dia BR. null → hoje. */
function payDate(s: string | null | undefined): Date {
  if (!s) return new Date();
  const d = new Date(`${s}T12:00:00-03:00`);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

/**
 * v1.2-CG: cria a VENDA da lojinha de uma graduação paga (entra no caixa/
 * histórico). Sem itens (não mexe em estoque). Devolve o id da venda.
 */
async function createGradSale(
  tx: Prisma.TransactionClient,
  args: { tenantId: string; sellerUserId: string; leadId: string | null; customerName: string | null; amount: number; method: Payment | null; paidAt: Date; aluno: string },
): Promise<string> {
  const sale = await tx.sale.create({
    data: {
      tenantId: args.tenantId,
      sellerUserId: args.sellerUserId,
      customerLeadId: args.leadId,
      customerName: args.customerName,
      total: args.amount,
      discount: 0,
      paymentMethod: saleMethod(args.method),
      paidAt: args.paidAt,
      notes: `Graduação: ${args.aluno}`,
    },
    select: { id: true },
  });
  return sale.id;
}

const paymentSchema = z.object({
  id: z.string().min(1),
  paid: z.boolean(),
  paymentMethod: z.enum(PAYMENT).optional().nullable(),
  // v1.2-CG: valor pago (vendedora preenche; pode negociar).
  amount: z.number().nonnegative().max(1_000_000).optional().nullable(),
  paidAt: z.string().optional().nullable(),
});

/**
 * v1.2-BW/CG: marca/desmarca o pagamento da taxa de exame (ADM/gerente). Ao
 * marcar pago com valor, gera uma VENDA na lojinha; ao desmarcar, apaga a venda.
 */
export async function setExamPayment(input: unknown): Promise<Result> {
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant, user } = await requireRole("SELLER");
  const d = parsed.data;

  const exam = await prisma.graduationExam.findFirst({
    where: { id: d.id, tenantId: tenant.id },
    select: {
      id: true, saleId: true,
      aluno: { select: { lead: { select: { id: true, name: true } } } },
    },
  });
  if (!exam) return { ok: false, error: "agendamento não encontrado" };

  await prisma.$transaction(async (tx) => {
    // Apaga venda antiga (re-marcação ou desmarque) pra não duplicar no caixa.
    if (exam.saleId) {
      await tx.sale.deleteMany({ where: { id: exam.saleId, tenantId: tenant.id } });
    }
    if (d.paid) {
      const amount = d.amount ?? 0;
      const saleId = amount > 0
        ? await createGradSale(tx, {
            tenantId: tenant.id,
            sellerUserId: user.id,
            leadId: exam.aluno.lead.id,
            customerName: exam.aluno.lead.name,
            amount,
            method: d.paymentMethod ?? null,
            paidAt: payDate(d.paidAt),
            aluno: exam.aluno.lead.name,
          })
        : null;
      await tx.graduationExam.update({
        where: { id: exam.id },
        data: { paid: true, paymentMethod: d.paymentMethod ?? null, paidAt: payDate(d.paidAt), amount: amount > 0 ? amount : null, saleId },
      });
    } else {
      await tx.graduationExam.update({
        where: { id: exam.id },
        data: { paid: false, paymentMethod: null, paidAt: null, amount: null, saleId: null },
      });
    }
  });

  revalidatePath("/graduacao");
  revalidatePath("/pdv/historico");
  revalidatePath("/pdv");
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// v1.2-CG: pagamento de graduação dos KIDS (não fazem prova). Cada registro já
// é um pagamento e vira venda na lojinha.
// ──────────────────────────────────────────────────────────────────────────

const kidPaymentSchema = z.object({
  alunoId: z.string().min(1),
  amount: z.number().positive().max(1_000_000),
  paymentMethod: z.enum(PAYMENT).optional().nullable(),
  paidAt: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable(),
});

export async function addKidPayment(input: unknown): Promise<Result> {
  const parsed = kidPaymentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "input inválido" };
  }
  const { tenant, user } = await requireRole("SELLER");
  const d = parsed.data;

  const aluno = await prisma.aluno.findFirst({
    where: { id: d.alunoId, tenantId: tenant.id },
    select: { id: true, lead: { select: { id: true, name: true } } },
  });
  if (!aluno) return { ok: false, error: "aluno não encontrado" };

  await prisma.$transaction(async (tx) => {
    const saleId = await createGradSale(tx, {
      tenantId: tenant.id,
      sellerUserId: user.id,
      leadId: aluno.lead.id,
      customerName: aluno.lead.name,
      amount: d.amount,
      method: d.paymentMethod ?? null,
      paidAt: payDate(d.paidAt),
      aluno: aluno.lead.name,
    });
    await tx.graduationKidPayment.create({
      data: {
        tenantId: tenant.id,
        alunoId: aluno.id,
        amount: d.amount,
        paymentMethod: d.paymentMethod ?? null,
        paidAt: payDate(d.paidAt),
        notes: d.notes?.trim() || null,
        saleId,
        createdById: user.id,
      },
    });
  });

  revalidatePath("/graduacao");
  revalidatePath("/pdv/historico");
  revalidatePath("/pdv");
  return { ok: true };
}

export async function removeKidPayment(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("SELLER");

  const kp = await prisma.graduationKidPayment.findFirst({
    where: { id: parsed.data.id, tenantId: tenant.id },
    select: { id: true, saleId: true },
  });
  if (!kp) return { ok: false, error: "pagamento não encontrado" };

  await prisma.$transaction(async (tx) => {
    if (kp.saleId) await tx.sale.deleteMany({ where: { id: kp.saleId, tenantId: tenant.id } });
    await tx.graduationKidPayment.delete({ where: { id: kp.id } });
  });

  revalidatePath("/graduacao");
  revalidatePath("/pdv/historico");
  revalidatePath("/pdv");
  return { ok: true };
}

export async function cancelExam(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("SELLER");

  const exam = await prisma.graduationExam.findFirst({
    where: { id: parsed.data.id, tenantId: tenant.id },
    select: { id: true },
  });
  if (!exam) return { ok: false, error: "agendamento não encontrado" };

  // Apaga pra liberar o horário (unique por slot).
  await prisma.graduationExam.delete({ where: { id: exam.id } });

  revalidatePath("/graduacao");
  revalidatePath("/professor/provas");
  return { ok: true };
}

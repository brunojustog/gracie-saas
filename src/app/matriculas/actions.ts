"use server";

import { addDays, addMonths, differenceInCalendarDays, startOfDay } from "date-fns";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { findEnrollmentInScope } from "@/server/enrollments";
import { appendLeadNote } from "@/server/lead-notes";
import { findLeadInScope } from "@/server/leads";
import { requireTenantUser } from "@/server/tenant";

type ActionResult =
  | { ok: true; enrollmentId: string }
  | { ok: false; error: string };

// ──────────────────────────────────────────────────────────────────────────
// Criar matrícula — também promove o lead pro stage isWon automaticamente
// ──────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  leadId: z.string().min(1),
  modalityId: z.string().min(1),
  planId: z.string().min(1),
  monthlyValue: z.number().positive().max(100_000),
  paymentMethod: z.enum(["CREDIT_CARD", "PIX", "BOLETO", "CASH", "TRANSFER", "OTHER"]),
  observations: z.string().max(2000).optional(),
  /** v1.1-AB: primeiro vencimento. Sem ele, default = 1 mês após a matrícula. */
  nextDueDate: z.string().date().optional(),
});

export async function createEnrollment(input: unknown): Promise<ActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();

  const lead = await findLeadInScope(membership, parsed.data.leadId);
  if (!lead) return { ok: false, error: "lead não encontrado ou sem permissão" };

  // Lead já tem matrícula? (leadId é unique no schema)
  const existing = await prisma.enrollment.findUnique({
    where: { leadId: lead.id },
    select: { id: true, status: true },
  });
  if (existing) {
    return {
      ok: false,
      error:
        existing.status === "ACTIVE"
          ? "lead já tem matrícula ativa"
          : "lead já teve matrícula (cancelada/suspensa) — contate admin",
    };
  }

  // Modalidade + plano DO MESMO TENANT (proteção contra tampering)
  const [modality, plan] = await Promise.all([
    prisma.modality.findFirst({
      where: { id: parsed.data.modalityId, tenantId: tenant.id, active: true },
      select: { id: true },
    }),
    prisma.plan.findFirst({
      where: { id: parsed.data.planId, tenantId: tenant.id, active: true },
      select: { id: true },
    }),
  ]);
  if (!modality) return { ok: false, error: "modalidade inválida" };
  if (!plan) return { ok: false, error: "plano inválido" };

  // Stage isWon ativo do tenant (ex: "Matriculado")
  const wonStage = await prisma.stage.findFirst({
    where: { tenantId: tenant.id, isWon: true, active: true },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  if (!wonStage) {
    return { ok: false, error: "tenant não tem stage 'Matriculado' configurado" };
  }

  const created = await prisma.$transaction(async (tx) => {
    const enrollment = await tx.enrollment.create({
      data: {
        tenantId: tenant.id,
        leadId: lead.id,
        modalityId: parsed.data.modalityId,
        planId: parsed.data.planId,
        monthlyValue: parsed.data.monthlyValue,
        paymentMethod: parsed.data.paymentMethod,
        observations: parsed.data.observations ?? null,
        status: "ACTIVE",
        nextDueDate: parsed.data.nextDueDate
          ? new Date(parsed.data.nextDueDate)
          : addMonths(new Date(), 1),
      },
    });

    // Promove lead pro stage Matriculado se ainda não está nele
    if (lead.stageId !== wonStage.id) {
      await tx.lead.update({
        where: { id: lead.id },
        data: {
          stageId: wonStage.id,
          modalityId: parsed.data.modalityId,
          lastInteractionAt: new Date(),
        },
      });
      await tx.stageHistory.create({
        data: {
          leadId: lead.id,
          fromStageId: lead.stageId,
          toStageId: wonStage.id,
          changedById: user.id,
          notes: "Matrícula criada automaticamente",
        },
      });
    }

    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId: lead.id,
        authorId: user.id,
        kind: "ENROLLMENT_CREATED",
        body: `Matrícula criada — R$ ${parsed.data.monthlyValue.toFixed(2)}/mês via ${parsed.data.paymentMethod.toLowerCase()}`,
        metadata: {
          enrollmentId: enrollment.id,
          modalityId: parsed.data.modalityId,
          planId: parsed.data.planId,
          monthlyValue: parsed.data.monthlyValue,
        },
      },
      tx,
    );

    return enrollment;
  });

  revalidatePath("/matriculas");
  revalidatePath("/kanban");
  return { ok: true, enrollmentId: created.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Editar matrícula (v1.1-Q; role-aware desde v1.1-AB)
// ──────────────────────────────────────────────────────────────────────────
//
// Permite ajustar plano, modalidade, valor, pagamento, datas e observações
// de uma matrícula existente. NÃO mexe em status (transições usam as
// actions específicas: cancel/suspend/reactivate) nem move o lead no
// kanban — edição de matrícula é independente da jornada do lead.
//
// SELLER pode editar (v1.1-AB) e, desde v1.1-AG, TROCAR plano/modalidade
// (mudança de plano é operação de venda — melhor que cancelar+recriar, que
// perderia histórico e moveria o lead pra "perdido"). O que SELLER continua
// NÃO controlando é o VALOR: o campo é ignorado server-side; ao trocar de
// plano, o valor assume o preço de tabela do plano novo. Desconto negociado
// é ajuste de ADMIN/MANAGER depois (valores são mascarados desde v1.1-P).

const updateSchema = z.object({
  enrollmentId: z.string().min(1),
  modalityId: z.string().min(1).optional(),
  planId: z.string().min(1).optional(),
  monthlyValue: z.number().positive().max(100_000).optional(),
  paymentMethod: z.enum(["CREDIT_CARD", "PIX", "BOLETO", "CASH", "TRANSFER", "OTHER"]),
  enrolledAt: z.string().date(),
  /** null limpa o vencimento (sem controle); undefined mantém o atual. */
  nextDueDate: z.string().date().nullable().optional(),
  observations: z.string().max(2000).nullable().optional(),
  // v1.1-AL: sexo + graduação são do ALUNO (Lead), editáveis a partir da
  // matrícula. undefined = não mexe.
  gender: z.enum(["FEMALE", "MALE"]).nullable().optional(),
  belt: z.string().max(30).nullable().optional(),
  beltDegree: z.number().int().min(0).max(4).nullable().optional(),
});

export async function updateEnrollment(input: unknown): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();
  const enrollment = await findEnrollmentInScope(membership, parsed.data.enrollmentId);
  if (!enrollment) return { ok: false, error: "matrícula não encontrada ou sem permissão" };

  const previous = await prisma.enrollment.findUnique({
    where: { id: enrollment.id },
    select: {
      modalityId: true,
      planId: true,
      monthlyValue: true,
      paymentMethod: true,
      enrolledAt: true,
      nextDueDate: true,
      observations: true,
      modality: { select: { name: true } },
      plan: { select: { name: true } },
    },
  });
  if (!previous) return { ok: false, error: "matrícula desapareceu" };

  const isSeller = membership.role === "SELLER";
  const effectiveModalityId = parsed.data.modalityId ?? previous.modalityId;
  const effectivePlanId = parsed.data.planId ?? previous.planId;
  // SELLER não define valor: mantém o atual — e, se trocou de plano, assume
  // o preço de tabela do plano novo (resolvido na validação abaixo).
  let effectiveMonthlyValue = isSeller
    ? Number(previous.monthlyValue)
    : (parsed.data.monthlyValue ?? Number(previous.monthlyValue));

  // Modalidade + plano DO MESMO TENANT (proteção contra tampering) — só
  // valida quando mudou (modalidade/plano podem ter sido desativados
  // depois da matrícula; manter o atual continua válido).
  let modalityName = previous.modality.name;
  let planName = previous.plan.name;
  if (effectiveModalityId !== previous.modalityId) {
    const modality = await prisma.modality.findFirst({
      where: { id: effectiveModalityId, tenantId: tenant.id, active: true },
      select: { id: true, name: true },
    });
    if (!modality) return { ok: false, error: "modalidade inválida" };
    modalityName = modality.name;
  }
  if (effectivePlanId !== previous.planId) {
    const plan = await prisma.plan.findFirst({
      where: { id: effectivePlanId, tenantId: tenant.id, active: true },
      select: { id: true, name: true, monthlyValue: true },
    });
    if (!plan) return { ok: false, error: "plano inválido" };
    planName = plan.name;
    if (isSeller) effectiveMonthlyValue = Number(plan.monthlyValue);
  }

  const newEnrolledAt = new Date(parsed.data.enrolledAt);
  // undefined = campo não veio (mantém); null = limpar explicitamente.
  const newNextDueDate =
    parsed.data.nextDueDate === undefined
      ? previous.nextDueDate
      : parsed.data.nextDueDate === null
        ? null
        : new Date(parsed.data.nextDueDate);

  const fmtDate = (d: Date | null) =>
    d ? d.toLocaleDateString("pt-BR") : "—";

  const diffs: string[] = [];
  if (previous.modalityId !== effectiveModalityId) {
    diffs.push(`modalidade: ${previous.modality.name} → ${modalityName}`);
  }
  if (previous.planId !== effectivePlanId) {
    diffs.push(`plano: ${previous.plan.name} → ${planName}`);
  }
  if (Number(previous.monthlyValue) !== effectiveMonthlyValue) {
    diffs.push(
      `valor: R$ ${Number(previous.monthlyValue).toFixed(2)} → R$ ${effectiveMonthlyValue.toFixed(2)}`,
    );
  }
  if (previous.paymentMethod !== parsed.data.paymentMethod) {
    diffs.push(
      `pagamento: ${previous.paymentMethod.toLowerCase()} → ${parsed.data.paymentMethod.toLowerCase()}`,
    );
  }
  if (previous.enrolledAt.toISOString().slice(0, 10) !== parsed.data.enrolledAt) {
    diffs.push(
      `data: ${previous.enrolledAt.toLocaleDateString("pt-BR")} → ${newEnrolledAt.toLocaleDateString("pt-BR")}`,
    );
  }
  if (
    (previous.nextDueDate?.getTime() ?? null) !== (newNextDueDate?.getTime() ?? null)
  ) {
    diffs.push(
      `vencimento: ${fmtDate(previous.nextDueDate)} → ${fmtDate(newNextDueDate)}`,
    );
  }
  const newObs = parsed.data.observations ?? null;
  if ((previous.observations ?? null) !== newObs) {
    diffs.push("observações atualizadas");
  }

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: {
        modalityId: effectiveModalityId,
        planId: effectivePlanId,
        monthlyValue: effectiveMonthlyValue,
        paymentMethod: parsed.data.paymentMethod,
        enrolledAt: newEnrolledAt,
        nextDueDate: newNextDueDate,
        observations: newObs,
      },
    });

    // Sexo/graduação ficam no Lead — atualiza junto quando vierem no payload.
    const leadData: Record<string, unknown> = {};
    if (parsed.data.gender !== undefined) leadData.gender = parsed.data.gender;
    if (parsed.data.belt !== undefined) {
      leadData.belt = parsed.data.belt;
      leadData.beltDegree = parsed.data.belt ? (parsed.data.beltDegree ?? 0) : null;
    }
    if (Object.keys(leadData).length > 0) {
      await tx.lead.update({ where: { id: enrollment.leadId }, data: leadData });
    }

    if (diffs.length > 0) {
      await appendLeadNote(
        {
          tenantId: tenant.id,
          leadId: enrollment.leadId,
          authorId: user.id,
          kind: "ENROLLMENT_UPDATED",
          body: `Matrícula editada — ${diffs.join("; ")}`,
          metadata: {
            enrollmentId: enrollment.id,
            modalityId: effectiveModalityId,
            planId: effectivePlanId,
            monthlyValue: effectiveMonthlyValue,
            paymentMethod: parsed.data.paymentMethod,
            enrolledAt: parsed.data.enrolledAt,
            nextDueDate: newNextDueDate?.toISOString() ?? null,
          },
        },
        tx,
      );
    }
  });

  revalidatePath("/matriculas");
  revalidatePath("/kanban");
  revalidatePath("/dashboard");
  return { ok: true, enrollmentId: enrollment.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Confirmar pagamento de mensalidade (v1.1-AB)
// ──────────────────────────────────────────────────────────────────────────
//
// Qualquer role do tenant (inclusive SELLER) confirma — é a vendedora quem
// cobra. Cria PaymentRecord (amount = snapshot do monthlyValue, sem expor
// valor pra quem confirma) e avança o vencimento +1 mês a partir do
// vencimento quitado (mantém o dia âncora; date-fns clampa dia 29-31 em
// meses curtos). Aluno 2 meses atrasado que paga 1 continua inadimplente —
// comportamento correto: cada confirmação quita UMA mensalidade.

const confirmPaymentSchema = z.object({
  enrollmentId: z.string().min(1),
  /** Data em que o aluno pagou. Default: hoje. */
  paidAt: z.string().date().optional(),
});

export async function confirmPayment(input: unknown): Promise<ActionResult> {
  const parsed = confirmPaymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();
  const enrollment = await findEnrollmentInScope(membership, parsed.data.enrollmentId);
  if (!enrollment) return { ok: false, error: "matrícula não encontrada ou sem permissão" };
  if (enrollment.status !== "ACTIVE") {
    return { ok: false, error: "só dá pra confirmar pagamento de matrícula ativa" };
  }

  const paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date();
  const settledDue = enrollment.nextDueDate;
  const nextDue = addMonths(settledDue ?? paidAt, 1);

  const fmt = (d: Date) => d.toLocaleDateString("pt-BR");

  await prisma.$transaction(async (tx) => {
    const payment = await tx.paymentRecord.create({
      data: {
        tenantId: tenant.id,
        enrollmentId: enrollment.id,
        dueDate: settledDue,
        paidAt,
        amount: enrollment.monthlyValue,
        method: enrollment.paymentMethod,
        confirmedById: user.id,
      },
    });

    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: { nextDueDate: nextDue },
    });

    // Sem valor no body — o diário é visível pra SELLER (financeiro mascarado).
    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId: enrollment.leadId,
        authorId: user.id,
        kind: "PAYMENT_CONFIRMED",
        body: settledDue
          ? `Pagamento confirmado (venc. ${fmt(settledDue)}) — próximo vencimento ${fmt(nextDue)}`
          : `Pagamento confirmado — próximo vencimento ${fmt(nextDue)}`,
        metadata: {
          enrollmentId: enrollment.id,
          paymentRecordId: payment.id,
          paidAt: paidAt.toISOString(),
          dueDate: settledDue?.toISOString() ?? null,
          nextDueDate: nextDue.toISOString(),
        },
      },
      tx,
    );
  });

  revalidatePath("/matriculas");
  revalidatePath("/dashboard");
  return { ok: true, enrollmentId: enrollment.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Pagamento TOTAL / quitação (v1.1-BB) — aluno paga N meses de uma vez.
// Empurra o vencimento e marca `paidInFullUntil`; enquanto quitado, sai da
// receita mensal recorrente (já foi recebido de uma vez).
// ──────────────────────────────────────────────────────────────────────────

const payInFullSchema = z.object({
  enrollmentId: z.string().min(1),
  /** Quantos meses foram quitados (ex.: 12 = ano). */
  months: z.number().int().min(1).max(60),
  /** Data do pagamento. Default: hoje. */
  paidAt: z.string().date().optional(),
  /** Valor total pago. Default: months × mensalidade. */
  totalAmount: z.number().nonnegative().max(10_000_000).optional(),
});

export async function payEnrollmentInFull(
  input: unknown,
): Promise<ActionResult> {
  const parsed = payInFullSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();
  const enrollment = await findEnrollmentInScope(membership, parsed.data.enrollmentId);
  if (!enrollment) return { ok: false, error: "matrícula não encontrada ou sem permissão" };
  if (enrollment.status !== "ACTIVE") {
    return { ok: false, error: "só dá pra quitar matrícula ativa" };
  }

  const { months } = parsed.data;
  const paidAt = parsed.data.paidAt ? new Date(parsed.data.paidAt) : new Date();
  // Ancora no vencimento atual (ou hoje) e avança N meses.
  const base = enrollment.nextDueDate ?? paidAt;
  const paidUntil = addMonths(base, months);
  const amount =
    parsed.data.totalAmount ?? Number(enrollment.monthlyValue) * months;
  const fmt = (d: Date) => d.toLocaleDateString("pt-BR");

  await prisma.$transaction(async (tx) => {
    const payment = await tx.paymentRecord.create({
      data: {
        tenantId: tenant.id,
        enrollmentId: enrollment.id,
        dueDate: enrollment.nextDueDate,
        paidAt,
        amount,
        method: enrollment.paymentMethod,
        confirmedById: user.id,
      },
    });

    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: { nextDueDate: paidUntil, paidInFullUntil: paidUntil },
    });

    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId: enrollment.leadId,
        authorId: user.id,
        kind: "PAYMENT_CONFIRMED",
        body: `Pagamento TOTAL de ${months} ${months === 1 ? "mês" : "meses"} — quitado até ${fmt(paidUntil)}`,
        metadata: {
          enrollmentId: enrollment.id,
          paymentRecordId: payment.id,
          paidAt: paidAt.toISOString(),
          paidInFullUntil: paidUntil.toISOString(),
          months,
        },
      },
      tx,
    );
  });

  revalidatePath("/matriculas");
  revalidatePath("/dashboard");
  revalidatePath("/quadro");
  return { ok: true, enrollmentId: enrollment.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Cancelar matrícula
// ──────────────────────────────────────────────────────────────────────────

const cancelSchema = z.object({
  enrollmentId: z.string().min(1),
  reason: z.string().max(2000).optional(),
  /** Se true, move o lead pro stage isLost ("Perda") + tag "Aluno Perdido" automaticamente. */
  moveToLost: z.boolean().default(false),
});

export async function cancelEnrollment(input: unknown): Promise<ActionResult> {
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();
  const enrollment = await findEnrollmentInScope(membership, parsed.data.enrollmentId);
  if (!enrollment) return { ok: false, error: "matrícula não encontrada ou sem permissão" };
  if (enrollment.status === "CANCELED") {
    return { ok: false, error: "matrícula já cancelada" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "CANCELED",
        canceledAt: new Date(),
        observations: parsed.data.reason
          ? `${enrollment.observations ?? ""}\n[cancelado] ${parsed.data.reason}`.trim()
          : enrollment.observations,
      },
    });

    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId: enrollment.leadId,
        authorId: user.id,
        kind: "ENROLLMENT_CANCELED",
        body: parsed.data.reason
          ? `Matrícula cancelada — ${parsed.data.reason}`
          : "Matrícula cancelada",
        metadata: { enrollmentId: enrollment.id, reason: parsed.data.reason ?? null },
      },
      tx,
    );

    if (parsed.data.moveToLost) {
      // v1.1: existe um único stage isLost ("Perda") por tenant. Tag
      // "Aluno Perdido" é adicionada acumulativamente pra distinguir
      // de outros tipos de perda (Não fechou, Sem interesse, etc.).
      const lostStage = await tx.stage.findFirst({
        where: { tenantId: tenant.id, isLost: true, active: true },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      if (lostStage) {
        const leadCurrent = await tx.lead.findUnique({
          where: { id: enrollment.leadId },
          select: { tags: true },
        });
        const ALUNO_PERDIDO_TAG = "Aluno Perdido";
        const newTags = leadCurrent && !leadCurrent.tags.includes(ALUNO_PERDIDO_TAG)
          ? [...leadCurrent.tags, ALUNO_PERDIDO_TAG]
          : leadCurrent?.tags ?? [];
        await tx.lead.update({
          where: { id: enrollment.leadId },
          data: { stageId: lostStage.id, tags: newTags, lastInteractionAt: new Date() },
        });
        await tx.stageHistory.create({
          data: {
            leadId: enrollment.leadId,
            toStageId: lostStage.id,
            changedById: user.id,
            notes: "Matrícula cancelada → aluno perdido (tag adicionada)",
          },
        });
      }
    }
  });

  revalidatePath("/matriculas");
  revalidatePath("/kanban");
  return { ok: true, enrollmentId: enrollment.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Resgatar matrícula (v1.1-BF) — aluno que cancelou/judicial voltou. Mesma
// ação serve pra rematrícula/mudança de status pós-cancelado/judicial:
// volta a ACTIVE, reinicia o vencimento e devolve o lead pro estágio Ganho.
// ──────────────────────────────────────────────────────────────────────────

const reinstateSchema = z.object({
  enrollmentId: z.string().min(1),
  /** Primeiro vencimento ao voltar. Default = 1 mês a partir de hoje. */
  nextDueDate: z.string().date().optional(),
});

export async function reinstateEnrollment(input: unknown): Promise<ActionResult> {
  const parsed = reinstateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();
  const enrollment = await findEnrollmentInScope(membership, parsed.data.enrollmentId);
  if (!enrollment) return { ok: false, error: "matrícula não encontrada ou sem permissão" };
  if (enrollment.status !== "CANCELED" && enrollment.status !== "JUDICIAL") {
    return { ok: false, error: "só dá pra resgatar matrícula cancelada ou judicial" };
  }

  const nextDue = parsed.data.nextDueDate
    ? new Date(parsed.data.nextDueDate)
    : addMonths(new Date(), 1);

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "ACTIVE",
        canceledAt: null,
        nextDueDate: nextDue,
      },
    });

    // Devolve o lead pro estágio Ganho e tira tags de perda.
    const wonStage = await tx.stage.findFirst({
      where: { tenantId: tenant.id, isWon: true, active: true },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    const leadCurrent = await tx.lead.findUnique({
      where: { id: enrollment.leadId },
      select: { tags: true },
    });
    const cleanedTags = (leadCurrent?.tags ?? []).filter(
      (t) => t !== "Aluno Perdido" && t !== "Judicial",
    );
    await tx.lead.update({
      where: { id: enrollment.leadId },
      data: {
        ...(wonStage ? { stageId: wonStage.id } : {}),
        tags: cleanedTags,
        lastInteractionAt: new Date(),
      },
    });
    if (wonStage) {
      await tx.stageHistory.create({
        data: {
          leadId: enrollment.leadId,
          toStageId: wonStage.id,
          changedById: user.id,
          notes: "Aluno resgatado (matrícula reativada)",
        },
      });
    }

    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId: enrollment.leadId,
        authorId: user.id,
        kind: "ENROLLMENT_REACTIVATED",
        body: `Aluno resgatado — matrícula reativada; próximo vencimento ${nextDue.toLocaleDateString("pt-BR")}.`,
        metadata: { enrollmentId: enrollment.id, nextDueDate: nextDue.toISOString() },
      },
      tx,
    );
  });

  revalidatePath("/matriculas");
  revalidatePath("/dashboard");
  revalidatePath("/kanban");
  revalidatePath("/quadro");
  return { ok: true, enrollmentId: enrollment.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Congelar matrícula (v1.1-AT) — continua ATIVA e cobrando; só marca o
// período pra repor os dias no fim do contrato.
// ──────────────────────────────────────────────────────────────────────────

const FROZEN_TAG = "Congelado";
const FERIAS_LIMIT_DAYS = 30;

const suspendSchema = z.object({
  enrollmentId: z.string().min(1),
  reason: z.string().min(1).max(2000),
  /** DOENCA = repõe o tempo do atestado; FERIAS = limite de 30 dias. */
  frozenKind: z.enum(["DOENCA", "FERIAS"]),
  /** Data prevista de retorno. ISO yyyy-mm-dd; null/undefined = sem prazo. */
  expectedReturnAt: z.string().date().nullable().optional(),
});

export async function suspendEnrollment(input: unknown): Promise<ActionResult> {
  const parsed = suspendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();
  const enrollment = await findEnrollmentInScope(membership, parsed.data.enrollmentId);
  if (!enrollment) return { ok: false, error: "matrícula não encontrada ou sem permissão" };
  if (enrollment.status !== "ACTIVE") {
    return { ok: false, error: "só dá pra congelar matrícula ativa" };
  }
  if (enrollment.suspendedAt) {
    return { ok: false, error: "matrícula já está congelada" };
  }

  const expectedReturn = parsed.data.expectedReturnAt
    ? new Date(parsed.data.expectedReturnAt)
    : null;
  const kindLabel = parsed.data.frozenKind === "FERIAS" ? "férias" : "doença";

  await prisma.$transaction(async (tx) => {
    // Status PERMANECE ACTIVE — congelado só marca o período (segue contando
    // como ativo e segue sendo cobrado). v1.1-AT.
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: {
        suspendedAt: new Date(),
        suspensionReason: parsed.data.reason,
        frozenKind: parsed.data.frozenKind,
        expectedReturnAt: expectedReturn,
      },
    });

    const lead = await tx.lead.findUnique({
      where: { id: enrollment.leadId },
      select: { tags: true },
    });
    if (lead && !lead.tags.includes(FROZEN_TAG)) {
      await tx.lead.update({
        where: { id: enrollment.leadId },
        data: { tags: [...lead.tags, FROZEN_TAG] },
      });
    }

    const returnLabel = expectedReturn
      ? ` (retorno previsto: ${expectedReturn.toLocaleDateString("pt-BR")})`
      : "";
    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId: enrollment.leadId,
        authorId: user.id,
        kind: "ENROLLMENT_SUSPENDED",
        body: `Congelado (${kindLabel}) — ${parsed.data.reason}${returnLabel}. Segue ativo e cobrando; dias serão repostos no fim do contrato.`,
        metadata: {
          enrollmentId: enrollment.id,
          reason: parsed.data.reason,
          frozenKind: parsed.data.frozenKind,
          expectedReturnAt: expectedReturn?.toISOString() ?? null,
        },
      },
      tx,
    );
  });

  revalidatePath("/matriculas");
  revalidatePath("/kanban");
  revalidatePath("/quadro");
  return { ok: true, enrollmentId: enrollment.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Descongelar (v1.1-AT) — acumula os dias congelados e estende o contrato.
// ──────────────────────────────────────────────────────────────────────────

const reactivateSchema = z.object({
  enrollmentId: z.string().min(1),
});

export async function reactivateEnrollment(input: unknown): Promise<ActionResult> {
  const parsed = reactivateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();
  const enrollment = await findEnrollmentInScope(membership, parsed.data.enrollmentId);
  if (!enrollment) return { ok: false, error: "matrícula não encontrada ou sem permissão" };
  if (!enrollment.suspendedAt) {
    return { ok: false, error: "matrícula não está congelada" };
  }

  // Dias congelados (calendário). Férias é limitada a 30 dias; doença usa o
  // período real (= tempo do atestado).
  const rawDays = Math.max(
    0,
    differenceInCalendarDays(startOfDay(new Date()), startOfDay(enrollment.suspendedAt)),
  );
  const frozenDays =
    enrollment.frozenKind === "FERIAS" ? Math.min(rawDays, FERIAS_LIMIT_DAYS) : rawDays;
  const newTotal = enrollment.frozenDaysUsed + frozenDays;
  const newContractEnd = enrollment.contractEndAt
    ? addDays(enrollment.contractEndAt, frozenDays)
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: {
        suspendedAt: null,
        suspensionReason: null,
        frozenKind: null,
        expectedReturnAt: null,
        frozenDaysUsed: newTotal,
        ...(newContractEnd ? { contractEndAt: newContractEnd } : {}),
      },
    });

    const lead = await tx.lead.findUnique({
      where: { id: enrollment.leadId },
      select: { tags: true },
    });
    if (lead?.tags.includes(FROZEN_TAG)) {
      await tx.lead.update({
        where: { id: enrollment.leadId },
        data: { tags: lead.tags.filter((t) => t !== FROZEN_TAG) },
      });
    }

    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId: enrollment.leadId,
        authorId: user.id,
        kind: "ENROLLMENT_REACTIVATED",
        body: `Descongelado — ${frozenDays} dia(s) a repor (total acumulado: ${newTotal})${newContractEnd ? `; novo fim de contrato ${newContractEnd.toLocaleDateString("pt-BR")}` : ""}.`,
        metadata: { enrollmentId: enrollment.id, frozenDays, frozenDaysTotal: newTotal },
      },
      tx,
    );
  });

  revalidatePath("/matriculas");
  revalidatePath("/kanban");
  revalidatePath("/quadro");
  return { ok: true, enrollmentId: enrollment.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Marcar como Judicial (v1.1-AU) — aluno que sumiu devendo (perda). Sai dos
// ativos, conta como cancelamento, vai pra carteira jurídica separada.
// ──────────────────────────────────────────────────────────────────────────

const judicialSchema = z.object({
  enrollmentId: z.string().min(1),
  reason: z.string().max(2000).optional(),
});

export async function markEnrollmentJudicial(input: unknown): Promise<ActionResult> {
  const parsed = judicialSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();
  const enrollment = await findEnrollmentInScope(membership, parsed.data.enrollmentId);
  if (!enrollment) return { ok: false, error: "matrícula não encontrada ou sem permissão" };
  if (enrollment.status === "JUDICIAL") {
    return { ok: false, error: "matrícula já está em cobrança judicial" };
  }
  if (enrollment.status === "CANCELED") {
    return { ok: false, error: "matrícula cancelada — não dá pra mover pra judicial" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "JUDICIAL",
        canceledAt: enrollment.canceledAt ?? new Date(),
        // descongela se estava congelada
        suspendedAt: null,
        suspensionReason: null,
        frozenKind: null,
      },
    });
    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId: enrollment.leadId,
        authorId: user.id,
        kind: "ENROLLMENT_CANCELED",
        body: parsed.data.reason
          ? `Movido para cobrança judicial — ${parsed.data.reason}`
          : "Movido para cobrança judicial (aluno sumiu devendo)",
        metadata: { enrollmentId: enrollment.id, judicial: true, reason: parsed.data.reason ?? null },
      },
      tx,
    );
  });

  revalidatePath("/matriculas");
  revalidatePath("/quadro");
  revalidatePath("/dashboard");
  return { ok: true, enrollmentId: enrollment.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Helpers usados pelos modais
// ──────────────────────────────────────────────────────────────────────────

export async function getEnrollmentFormOptions() {
  const { tenant } = await requireTenantUser();
  const [modalities, plans] = await Promise.all([
    prisma.modality.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    prisma.plan.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, monthlyValue: true, modalityId: true },
    }),
  ]);
  return {
    modalities,
    plans: plans.map((p) => ({
      ...p,
      monthlyValue: Number(p.monthlyValue),
    })),
  };
}

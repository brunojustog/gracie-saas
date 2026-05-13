"use server";

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
// Congelar matrícula (= "aluno afastado")
// ──────────────────────────────────────────────────────────────────────────

const SUSPENDED_TAG = "Congelado";

const suspendSchema = z.object({
  enrollmentId: z.string().min(1),
  reason: z.string().min(1).max(2000),
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
    return {
      ok: false,
      error:
        enrollment.status === "SUSPENDED"
          ? "matrícula já está congelada"
          : "só dá pra congelar matrícula ativa",
    };
  }

  const expectedReturn = parsed.data.expectedReturnAt
    ? new Date(parsed.data.expectedReturnAt)
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "SUSPENDED",
        suspendedAt: new Date(),
        suspensionReason: parsed.data.reason,
        expectedReturnAt: expectedReturn,
      },
    });

    // Tag visual no lead pra deixar claro no kanban que o aluno está afastado.
    const lead = await tx.lead.findUnique({
      where: { id: enrollment.leadId },
      select: { tags: true },
    });
    if (lead && !lead.tags.includes(SUSPENDED_TAG)) {
      await tx.lead.update({
        where: { id: enrollment.leadId },
        data: { tags: [...lead.tags, SUSPENDED_TAG] },
      });
    }

    const returnLabel = expectedReturn
      ? ` (retorno previsto: ${expectedReturn.toLocaleDateString("pt-BR")})`
      : " (sem prazo de retorno)";
    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId: enrollment.leadId,
        authorId: user.id,
        kind: "ENROLLMENT_SUSPENDED",
        body: `Matrícula congelada — ${parsed.data.reason}${returnLabel}`,
        metadata: {
          enrollmentId: enrollment.id,
          reason: parsed.data.reason,
          expectedReturnAt: expectedReturn?.toISOString() ?? null,
        },
      },
      tx,
    );
  });

  revalidatePath("/matriculas");
  revalidatePath("/kanban");
  return { ok: true, enrollmentId: enrollment.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Reativar matrícula (sai de SUSPENDED → ACTIVE)
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
  if (enrollment.status !== "SUSPENDED") {
    return {
      ok: false,
      error:
        enrollment.status === "ACTIVE"
          ? "matrícula já está ativa"
          : "matrícula cancelada não pode ser reativada — crie uma nova",
    };
  }

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: {
        status: "ACTIVE",
        suspendedAt: null,
        suspensionReason: null,
        expectedReturnAt: null,
      },
    });

    // Remove a tag "Congelado" se estiver presente.
    const lead = await tx.lead.findUnique({
      where: { id: enrollment.leadId },
      select: { tags: true },
    });
    if (lead?.tags.includes(SUSPENDED_TAG)) {
      await tx.lead.update({
        where: { id: enrollment.leadId },
        data: { tags: lead.tags.filter((t) => t !== SUSPENDED_TAG) },
      });
    }

    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId: enrollment.leadId,
        authorId: user.id,
        kind: "ENROLLMENT_REACTIVATED",
        body: "Matrícula reativada",
        metadata: { enrollmentId: enrollment.id },
      },
      tx,
    );
  });

  revalidatePath("/matriculas");
  revalidatePath("/kanban");
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

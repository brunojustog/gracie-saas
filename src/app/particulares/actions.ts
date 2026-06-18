"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { appendLeadNote } from "@/server/lead-notes";
import { findLeadInScope } from "@/server/leads";
import { countCompleted, deriveStatus, findPackageInScope } from "@/server/private-packages";
import { requireTenantUser } from "@/server/tenant";

type Result = { ok: true; packageId: string } | { ok: false; error: string };

const PARTICULAR_TAG = "Particular";
const PAYMENT = ["CREDIT_CARD", "PIX", "BOLETO", "CASH", "TRANSFER", "OTHER"] as const;

// ──────────────────────────────────────────────────────────────────────────
// Opções dos forms (modalidades + leads + vendedoras)
// ──────────────────────────────────────────────────────────────────────────

export async function getPrivateFormOptions() {
  const { tenant } = await requireTenantUser();
  const [modalities, leads, sellers] = await Promise.all([
    prisma.modality.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.lead.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    }),
    prisma.tenantUser.findMany({
      where: { tenantId: tenant.id, role: "SELLER", active: true },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    modalities,
    leads,
    sellers: sellers.map((s) => ({
      id: s.user.id,
      name: s.user.name ?? s.user.email,
    })),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Criar pacote — marca o lead com a tag "Particular". NÃO cria matrícula.
// ──────────────────────────────────────────────────────────────────────────

const createSchema = z.object({
  leadId: z.string().min(1),
  modalityId: z.string().min(1).nullable().optional(),
  totalClasses: z.number().int().min(1).max(500),
  value: z.number().nonnegative().max(1_000_000),
  paymentMethod: z.enum(PAYMENT).nullable().optional(),
  startDate: z.string().date(),
  endDate: z.string().date().nullable().optional(),
  soldById: z.string().min(1).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function createPrivatePackage(input: unknown): Promise<Result> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();
  const lead = await findLeadInScope(membership, parsed.data.leadId);
  if (!lead) return { ok: false, error: "lead não encontrado ou sem permissão" };

  if (parsed.data.modalityId) {
    const m = await prisma.modality.findFirst({
      where: { id: parsed.data.modalityId, tenantId: tenant.id },
      select: { id: true },
    });
    if (!m) return { ok: false, error: "modalidade inválida" };
  }

  const created = await prisma.$transaction(async (tx) => {
    const pkg = await tx.privatePackage.create({
      data: {
        tenantId: tenant.id,
        leadId: lead.id,
        modalityId: parsed.data.modalityId ?? null,
        totalClasses: parsed.data.totalClasses,
        value: parsed.data.value,
        paymentMethod: parsed.data.paymentMethod ?? null,
        startDate: new Date(parsed.data.startDate),
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
        soldById: parsed.data.soldById ?? null,
      },
    });

    // Tag "Particular" no lead (sem duplicar).
    const cur = await tx.lead.findUnique({
      where: { id: lead.id },
      select: { tags: true, stageId: true },
    });
    if (cur && !cur.tags.includes(PARTICULAR_TAG)) {
      await tx.lead.update({
        where: { id: lead.id },
        data: { tags: [...cur.tags, PARTICULAR_TAG], lastInteractionAt: new Date() },
      });
    }

    // v1.1-AR: move o lead pro estágio terminal "Aula Particular" (se
    // existir), pra sair do funil de mensalistas sem contar como matrícula.
    const privateStage = await tx.stage.findFirst({
      where: { tenantId: tenant.id, isPrivate: true, active: true },
      orderBy: { order: "asc" },
      select: { id: true },
    });
    if (privateStage && cur && cur.stageId !== privateStage.id) {
      await tx.lead.update({
        where: { id: lead.id },
        data: { stageId: privateStage.id, lastInteractionAt: new Date() },
      });
      await tx.stageHistory.create({
        data: {
          leadId: lead.id,
          fromStageId: cur.stageId,
          toStageId: privateStage.id,
          changedById: user.id,
          notes: "Movido para Aula Particular (pacote criado)",
        },
      });
    }

    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId: lead.id,
        authorId: user.id,
        kind: "PRIVATE_PACKAGE_CREATED",
        body: `Pacote de ${parsed.data.totalClasses} aulas particulares criado`,
        metadata: { packageId: pkg.id, totalClasses: parsed.data.totalClasses },
      },
      tx,
    );
    return pkg;
  });

  revalidatePath("/particulares");
  revalidatePath("/kanban");
  revalidatePath("/quadro");
  return { ok: true, packageId: created.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Editar pacote
// ──────────────────────────────────────────────────────────────────────────

const updateSchema = z.object({
  packageId: z.string().min(1),
  modalityId: z.string().min(1).nullable().optional(),
  totalClasses: z.number().int().min(1).max(500),
  value: z.number().nonnegative().max(1_000_000),
  paymentMethod: z.enum(PAYMENT).nullable().optional(),
  startDate: z.string().date(),
  endDate: z.string().date().nullable().optional(),
  soldById: z.string().min(1).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export async function updatePrivatePackage(input: unknown): Promise<Result> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { membership } = await requireTenantUser();
  const pkg = await findPackageInScope(membership, parsed.data.packageId);
  if (!pkg) return { ok: false, error: "pacote não encontrado ou sem permissão" };

  // Reavalia status: aumentar totalClasses pode reabrir um pacote concluído.
  const completed = countCompleted(pkg.sessions);
  const status = deriveStatus(pkg.status, completed, parsed.data.totalClasses);

  await prisma.privatePackage.update({
    where: { id: pkg.id },
    data: {
      modalityId: parsed.data.modalityId ?? null,
      totalClasses: parsed.data.totalClasses,
      value: parsed.data.value,
      paymentMethod: parsed.data.paymentMethod ?? null,
      startDate: new Date(parsed.data.startDate),
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      soldById: parsed.data.soldById ?? null,
      notes: parsed.data.notes ?? null,
      status,
    },
  });

  revalidatePath("/particulares");
  revalidatePath("/quadro");
  return { ok: true, packageId: pkg.id };
}

export async function cancelPrivatePackage(input: unknown): Promise<Result> {
  const parsed = z.object({ packageId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();
  const pkg = await findPackageInScope(membership, parsed.data.packageId);
  if (!pkg) return { ok: false, error: "pacote não encontrado ou sem permissão" };
  if (pkg.status === "CANCELED") return { ok: false, error: "pacote já cancelado" };

  await prisma.$transaction(async (tx) => {
    await tx.privatePackage.update({
      where: { id: pkg.id },
      data: { status: "CANCELED", canceledAt: new Date() },
    });
    await appendLeadNote(
      {
        tenantId: tenant.id,
        leadId: pkg.leadId,
        authorId: user.id,
        kind: "PRIVATE_PACKAGE_CANCELED",
        body: "Pacote de aulas particulares cancelado",
        metadata: { packageId: pkg.id },
      },
      tx,
    );
  });

  revalidatePath("/particulares");
  revalidatePath("/quadro");
  return { ok: true, packageId: pkg.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Sessões (aulas dentro do pacote)
// ──────────────────────────────────────────────────────────────────────────

/** Recalcula o status do pacote a partir das sessões; registra conclusão. */
async function recomputePackageStatus(packageId: string): Promise<void> {
  const pkg = await prisma.privatePackage.findUnique({
    where: { id: packageId },
    select: {
      id: true,
      tenantId: true,
      leadId: true,
      status: true,
      totalClasses: true,
      sessions: { select: { completedAt: true } },
    },
  });
  if (!pkg) return;
  const completed = countCompleted(pkg.sessions);
  const next = deriveStatus(pkg.status, completed, pkg.totalClasses);
  if (next === pkg.status) return;

  await prisma.privatePackage.update({
    where: { id: pkg.id },
    data: { status: next },
  });
  if (next === "COMPLETED") {
    await appendLeadNote({
      tenantId: pkg.tenantId,
      leadId: pkg.leadId,
      kind: "PRIVATE_PACKAGE_COMPLETED",
      body: `Contrato de aulas particulares concluído (${completed}/${pkg.totalClasses})`,
      metadata: { packageId: pkg.id },
    });
  }
}

const sessionSchema = z.object({
  packageId: z.string().min(1),
  sessionId: z.string().min(1).optional(),
  scheduledDate: z.string().date().nullable().optional(),
  completed: z.boolean().default(false),
  completedDate: z.string().date().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function saveSession(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = sessionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { membership } = await requireTenantUser();
  const pkg = await findPackageInScope(membership, parsed.data.packageId);
  if (!pkg) return { ok: false, error: "pacote não encontrado ou sem permissão" };

  const completedAt = parsed.data.completed
    ? parsed.data.completedDate
      ? new Date(parsed.data.completedDate)
      : new Date()
    : null;
  const scheduledDate = parsed.data.scheduledDate
    ? new Date(parsed.data.scheduledDate)
    : null;

  if (parsed.data.sessionId) {
    // garante que a sessão é do pacote (que já está no scope)
    const existing = await prisma.privateSession.findFirst({
      where: { id: parsed.data.sessionId, packageId: pkg.id },
      select: { id: true },
    });
    if (!existing) return { ok: false, error: "sessão não encontrada" };
    await prisma.privateSession.update({
      where: { id: existing.id },
      data: { scheduledDate, completedAt, notes: parsed.data.notes ?? null },
    });
  } else {
    await prisma.privateSession.create({
      data: {
        packageId: pkg.id,
        scheduledDate,
        completedAt,
        notes: parsed.data.notes ?? null,
      },
    });
  }

  await recomputePackageStatus(pkg.id);
  revalidatePath("/particulares");
  revalidatePath("/quadro");
  return { ok: true };
}

export async function deleteSession(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = z
    .object({ packageId: z.string().min(1), sessionId: z.string().min(1) })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { membership } = await requireTenantUser();
  const pkg = await findPackageInScope(membership, parsed.data.packageId);
  if (!pkg) return { ok: false, error: "pacote não encontrado ou sem permissão" };

  await prisma.privateSession.deleteMany({
    where: { id: parsed.data.sessionId, packageId: pkg.id },
  });
  await recomputePackageStatus(pkg.id);
  revalidatePath("/particulares");
  return { ok: true };
}

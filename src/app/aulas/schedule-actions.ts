"use server";

/**
 * CRUD da grade (ClassSchedule) e atalho pra criar modalidade direto
 * da tela /aulas (v1.1-S).
 *
 * Política: qualquer role do tenant pode mexer (mesmo critério do v1.1-O —
 * agenda é dinâmica e operacional, não administrativa). O CRUD ADMIN-only
 * em /settings/modalidades continua existindo pra ops mais cuidadosas.
 *
 * Sem validação de overlap — decisão do v1.1-S: academia pode ter 2
 * modalidades simultâneas em salas diferentes.
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireTenantUser } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };
type CreateResult<T> = ({ ok: true } & T) | { ok: false; error: string };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

// ──────────────────────────────────────────────────────────────────────────
// ClassSchedule (grade fixa)
// ──────────────────────────────────────────────────────────────────────────

const createSlotSchema = z.object({
  modalityId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(HHMM, "use HH:MM"),
  durationMinutes: z.number().int().min(15).max(480),
});

export async function createScheduleSlot(
  input: unknown,
): Promise<CreateResult<{ slotId: string }>> {
  const parsed = createSlotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant } = await requireTenantUser();

  const modality = await prisma.modality.findFirst({
    where: { id: parsed.data.modalityId, tenantId: tenant.id, active: true },
    select: { id: true },
  });
  if (!modality) return { ok: false, error: "modalidade inválida" };

  const created = await prisma.classSchedule.create({
    data: {
      tenantId: tenant.id,
      modalityId: parsed.data.modalityId,
      dayOfWeek: parsed.data.dayOfWeek,
      startTime: parsed.data.startTime,
      durationMinutes: parsed.data.durationMinutes,
    },
    select: { id: true },
  });

  revalidatePath("/aulas");
  return { ok: true, slotId: created.id };
}

const updateSlotSchema = z.object({
  id: z.string().min(1),
  modalityId: z.string().min(1),
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(HHMM, "use HH:MM"),
  durationMinutes: z.number().int().min(15).max(480),
});

export async function updateScheduleSlot(input: unknown): Promise<Result> {
  const parsed = updateSlotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant } = await requireTenantUser();

  // Garante que o slot pertence ao tenant (tampering).
  const target = await prisma.classSchedule.findFirst({
    where: { id: parsed.data.id, tenantId: tenant.id },
    select: { id: true },
  });
  if (!target) return { ok: false, error: "horário não encontrado" };

  const modality = await prisma.modality.findFirst({
    where: { id: parsed.data.modalityId, tenantId: tenant.id, active: true },
    select: { id: true },
  });
  if (!modality) return { ok: false, error: "modalidade inválida" };

  await prisma.classSchedule.update({
    where: { id: target.id },
    data: {
      modalityId: parsed.data.modalityId,
      dayOfWeek: parsed.data.dayOfWeek,
      startTime: parsed.data.startTime,
      durationMinutes: parsed.data.durationMinutes,
      active: true,
    },
  });

  revalidatePath("/aulas");
  return { ok: true };
}

const deleteSlotSchema = z.object({ id: z.string().min(1) });

export async function deleteScheduleSlot(input: unknown): Promise<Result> {
  const parsed = deleteSlotSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant } = await requireTenantUser();

  // Soft delete via active=false. Mantém referência caso queira reativar
  // depois (e preserva histórico de aulas que apontaram pra esse slot).
  const target = await prisma.classSchedule.findFirst({
    where: { id: parsed.data.id, tenantId: tenant.id },
    select: { id: true },
  });
  if (!target) return { ok: false, error: "horário não encontrado" };

  await prisma.classSchedule.update({
    where: { id: target.id },
    data: { active: false },
  });

  revalidatePath("/aulas");
  return { ok: true };
}

// ──────────────────────────────────────────────────────────────────────────
// Modality (atalho pra criar/editar direto da /aulas, qualquer role)
// ──────────────────────────────────────────────────────────────────────────

const createModalityInlineSchema = z.object({
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  ageRange: z.string().max(50).nullable().optional(),
});

export async function createModalityInline(
  input: unknown,
): Promise<CreateResult<{ modalityId: string }>> {
  const parsed = createModalityInlineSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant } = await requireTenantUser();

  const existing = await prisma.modality.findFirst({
    where: { tenantId: tenant.id, name: parsed.data.name },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: `já existe modalidade "${parsed.data.name}"` };
  }

  const created = await prisma.modality.create({
    data: {
      tenantId: tenant.id,
      name: parsed.data.name,
      color: parsed.data.color ?? null,
      ageRange: parsed.data.ageRange ?? null,
    },
    select: { id: true },
  });

  revalidatePath("/aulas");
  revalidatePath("/settings/modalidades");
  revalidatePath("/kanban");
  return { ok: true, modalityId: created.id };
}

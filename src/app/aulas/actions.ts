"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { findClassInScope } from "@/server/experimental-classes";
import { findLeadInScope } from "@/server/leads";
import { requireTenantUser } from "@/server/tenant";

type ActionResult =
  | { ok: true; classId: string }
  | { ok: false; error: string };

// ──────────────────────────────────────────────────────────────────────────
// Agendar nova aula experimental
// ──────────────────────────────────────────────────────────────────────────

const scheduleSchema = z.object({
  leadId: z.string().min(1),
  modalityId: z.string().min(1),
  scheduledDate: z.string().datetime(), // ISO
  notes: z.string().max(2000).optional(),
});

export async function scheduleClass(input: unknown): Promise<ActionResult> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, membership } = await requireTenantUser();

  const lead = await findLeadInScope(membership, parsed.data.leadId);
  if (!lead) return { ok: false, error: "lead não encontrado ou sem permissão" };

  const modality = await prisma.modality.findFirst({
    where: { id: parsed.data.modalityId, tenantId: tenant.id, active: true },
    select: { id: true },
  });
  if (!modality) return { ok: false, error: "modalidade inválida" };

  const created = await prisma.experimentalClass.create({
    data: {
      tenantId: tenant.id,
      leadId: lead.id,
      modalityId: modality.id,
      scheduledDate: new Date(parsed.data.scheduledDate),
      status: "SCHEDULED",
      notes: parsed.data.notes ?? null,
    },
  });

  // Sinaliza interação com o lead
  await prisma.lead.update({
    where: { id: lead.id },
    data: { lastInteractionAt: new Date() },
  });

  revalidatePath("/aulas");
  revalidatePath("/kanban");
  return { ok: true, classId: created.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Mudanças de status (confirm, attended, no-show, cancel)
// ──────────────────────────────────────────────────────────────────────────

const updateStatusSchema = z.object({
  classId: z.string().min(1),
  status: z.enum(["CONFIRMED", "ATTENDED", "NO_SHOW", "CANCELED"]),
});

export async function updateClassStatus(input: unknown): Promise<ActionResult> {
  const parsed = updateStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { membership } = await requireTenantUser();
  const cls = await findClassInScope(membership, parsed.data.classId);
  if (!cls) return { ok: false, error: "aula não encontrada ou sem permissão" };

  await prisma.experimentalClass.update({
    where: { id: cls.id },
    data: {
      status: parsed.data.status,
      attendedAt: parsed.data.status === "ATTENDED" ? new Date() : null,
    },
  });

  revalidatePath("/aulas");
  revalidatePath("/kanban");
  return { ok: true, classId: cls.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Reagendar (drag-to-reschedule no calendar OU modal)
// ──────────────────────────────────────────────────────────────────────────

const rescheduleSchema = z.object({
  classId: z.string().min(1),
  scheduledDate: z.string().datetime(),
});

export async function rescheduleClass(input: unknown): Promise<ActionResult> {
  const parsed = rescheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { membership } = await requireTenantUser();
  const cls = await findClassInScope(membership, parsed.data.classId);
  if (!cls) return { ok: false, error: "aula não encontrada ou sem permissão" };

  await prisma.experimentalClass.update({
    where: { id: cls.id },
    data: {
      scheduledDate: new Date(parsed.data.scheduledDate),
      status: "RESCHEDULED",
    },
  });

  revalidatePath("/aulas");
  revalidatePath("/kanban");
  return { ok: true, classId: cls.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Listagem de aulas de UM lead (usada na tab Aulas do LeadSheet)
// ──────────────────────────────────────────────────────────────────────────

export async function getClassesForLead(leadId: string) {
  const { membership } = await requireTenantUser();
  const lead = await findLeadInScope(membership, leadId);
  if (!lead) return null;

  return prisma.experimentalClass.findMany({
    where: { tenantId: lead.tenantId, leadId: lead.id },
    select: {
      id: true,
      scheduledDate: true,
      status: true,
      notes: true,
      modality: { select: { id: true, name: true, color: true } },
    },
    orderBy: { scheduledDate: "desc" },
  });
}

/** Pra abrir/popular o modal de "agendar nova" — devolve modalidades + slots. */
export async function getScheduleOptions() {
  const { tenant } = await requireTenantUser();
  const [modalities, slots] = await Promise.all([
    prisma.modality.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    prisma.classSchedule.findMany({
      where: { tenantId: tenant.id, active: true },
      select: {
        id: true,
        dayOfWeek: true,
        startTime: true,
        durationMinutes: true,
        modalityId: true,
      },
    }),
  ]);
  return { modalities, slots };
}

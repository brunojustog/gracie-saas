"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { findClassInScope } from "@/server/experimental-classes";
import { appendLeadNote } from "@/server/lead-notes";
import { findLeadInScope } from "@/server/leads";
import {
  cancelAppointmentJobs,
  enqueueAppointmentReminders,
  enqueueImmediate,
  enqueueNoShowSequence,
} from "@/server/messaging";
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
  /**
   * v1.1-BT: etapa da experimental. Se não vier, o servidor decide pela
   * regra do processo: 1ª aula do lead = INDIVIDUAL (só aluno + professor),
   * da 2ª em diante = GROUP (com a turma). Assim o kanban e qualquer outro
   * ponto de entrada acertam sozinhos.
   */
  kind: z.enum(["INDIVIDUAL", "GROUP"]).optional(),
});

export async function scheduleClass(input: unknown): Promise<ActionResult> {
  const parsed = scheduleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();

  const lead = await findLeadInScope(membership, parsed.data.leadId);
  if (!lead) return { ok: false, error: "lead não encontrado ou sem permissão" };

  const modality = await prisma.modality.findFirst({
    where: { id: parsed.data.modalityId, tenantId: tenant.id, active: true },
    select: { id: true, name: true },
  });
  if (!modality) return { ok: false, error: "modalidade inválida" };

  const scheduledFor = new Date(parsed.data.scheduledDate);

  // v1.1-BT: etapa da experimental. Sem escolha explícita, decide pela regra
  // do processo — nunca fez experimental (fora canceladas) = 1ª (individual).
  let kind = parsed.data.kind;
  if (!kind) {
    const previous = await prisma.experimentalClass.count({
      where: { tenantId: tenant.id, leadId: lead.id, status: { not: "CANCELED" } },
    });
    kind = previous === 0 ? "INDIVIDUAL" : "GROUP";
  }

  const created = await prisma.experimentalClass.create({
    data: {
      tenantId: tenant.id,
      leadId: lead.id,
      modalityId: modality.id,
      scheduledDate: scheduledFor,
      status: "SCHEDULED",
      kind,
      notes: parsed.data.notes ?? null,
    },
  });

  // Sinaliza interação com o lead
  await prisma.lead.update({
    where: { id: lead.id },
    data: { lastInteractionAt: new Date() },
  });

  await appendLeadNote({
    tenantId: tenant.id,
    leadId: lead.id,
    authorId: user.id,
    kind: "CLASS_SCHEDULED",
    body: `Aula experimental ${kind === "INDIVIDUAL" ? "individual (1ª)" : "em turma (2ª)"} agendada — ${modality.name} em ${scheduledFor.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`,
    metadata: {
      classId: created.id,
      modalityId: modality.id,
      scheduledFor: scheduledFor.toISOString(),
      kind,
    },
  });

  // Enfileira os lembretes de agendamento (confirm + D-1 + D-0 + 1h-before).
  // Isolado em try/catch — falha aqui não deve impedir a AE de ser criada.
  try {
    await enqueueAppointmentReminders({
      leadId: lead.id,
      classId: created.id,
      scheduledFor,
    });
  } catch (err) {
    console.error("[messaging] enqueueAppointmentReminders falhou", err);
  }

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

  const { tenant, user, membership } = await requireTenantUser();
  const cls = await findClassInScope(membership, parsed.data.classId);
  if (!cls) return { ok: false, error: "aula não encontrada ou sem permissão" };

  await prisma.experimentalClass.update({
    where: { id: cls.id },
    data: {
      status: parsed.data.status,
      attendedAt: parsed.data.status === "ATTENDED" ? new Date() : null,
    },
  });

  const NOTE_KIND_BY_STATUS = {
    ATTENDED: "CLASS_ATTENDED",
    NO_SHOW: "CLASS_NO_SHOW",
    CANCELED: "CLASS_CANCELED",
    CONFIRMED: null, // CONFIRMED não vira nota — é só um passo intermediário
  } as const;
  const NOTE_LABEL: Record<typeof parsed.data.status, string> = {
    ATTENDED: "Aula experimental: aluno compareceu",
    NO_SHOW: "Aula experimental: no-show (não compareceu)",
    CANCELED: "Aula experimental cancelada",
    CONFIRMED: "Aula experimental confirmada",
  };
  const kind = NOTE_KIND_BY_STATUS[parsed.data.status];
  if (kind) {
    await appendLeadNote({
      tenantId: tenant.id,
      leadId: cls.leadId,
      authorId: user.id,
      kind,
      body: NOTE_LABEL[parsed.data.status],
      metadata: { classId: cls.id, scheduledFor: cls.scheduledDate.toISOString() },
    });
  }

  // Triggers de mensagens conforme o novo status:
  //   ATTENDED  → mensagem pós-aula imediata
  //   NO_SHOW   → cadência de no-show (mesmo dia + D+2 + D+5)
  //   CANCELED  → cancela lembretes pendentes da AE
  //   CONFIRMED → sem trigger (lembretes já foram criados no scheduleClass)
  try {
    if (parsed.data.status === "ATTENDED") {
      await enqueueImmediate({
        leadId: cls.leadId,
        classId: cls.id,
        templateKey: "attendance.post",
      });
    } else if (parsed.data.status === "NO_SHOW") {
      await enqueueNoShowSequence({
        leadId: cls.leadId,
        classId: cls.id,
        scheduledFor: cls.scheduledDate,
      });
    } else if (parsed.data.status === "CANCELED") {
      await cancelAppointmentJobs(cls.id, "AE cancelada");
    }
  } catch (err) {
    console.error("[messaging] trigger de updateClassStatus falhou", err);
  }

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

  const { tenant, user, membership } = await requireTenantUser();
  const cls = await findClassInScope(membership, parsed.data.classId);
  if (!cls) return { ok: false, error: "aula não encontrada ou sem permissão" };

  const newScheduledFor = new Date(parsed.data.scheduledDate);
  await prisma.experimentalClass.update({
    where: { id: cls.id },
    data: {
      scheduledDate: newScheduledFor,
      status: "RESCHEDULED",
    },
  });

  await appendLeadNote({
    tenantId: tenant.id,
    leadId: cls.leadId,
    authorId: user.id,
    kind: "CLASS_RESCHEDULED",
    body: `Aula experimental reagendada — novo horário: ${newScheduledFor.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}`,
    metadata: {
      classId: cls.id,
      oldScheduledFor: cls.scheduledDate.toISOString(),
      newScheduledFor: newScheduledFor.toISOString(),
    },
  });

  // Lembretes antigos (calculados pro horário velho) viraram lixo. Cancela
  // os PENDING e re-enfileira pro novo horário.
  try {
    await cancelAppointmentJobs(cls.id, "AE reagendada — relembrar pro novo horário");
    await enqueueAppointmentReminders({
      leadId: cls.leadId,
      classId: cls.id,
      scheduledFor: newScheduledFor,
    });
  } catch (err) {
    console.error("[messaging] re-enqueue de reschedule falhou", err);
  }

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

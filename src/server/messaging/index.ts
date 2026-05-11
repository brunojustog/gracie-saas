/**
 * Orquestração das mensagens automáticas.
 *
 *   enqueueWelcomeSequence(leadId, start)
 *     — chamado quando lead chega via Chatwoot. Cria 8 jobs (M1..M8) da
 *       Etapa Novo Lead.
 *
 *   enqueueAppointmentReminders({ leadId, classId, scheduledFor })
 *     — chamado quando uma ExperimentalClass é criada/reagendada. Cria
 *       até 4 jobs: confirm imediato + D-1 + D-0 + 1h-before.
 *
 *   enqueueNoShowSequence({ leadId, classId, scheduledFor })
 *     — chamado quando AE marca status=NO_SHOW. Cria 3 jobs (mesmo dia,
 *       D+2, D+5).
 *
 *   enqueueImmediate({ leadId, classId?, templateKey })
 *     — pra mensagens disparadas na hora (pós-comparecimento). Cria 1 job
 *       com scheduledAt=now() que o próximo cron pega.
 *
 *   pauseLeadJobs(leadId, reason, opts?)
 *     — pausa todos PENDING do lead. Útil quando lead respondeu via
 *       Chatwoot ou mudou de stage.
 *
 *   cancelAppointmentJobs(classId, reason)
 *     — pausa só os PENDING ligados a uma AE específica (usado quando AE
 *       é cancelada/reagendada).
 *
 *   processDueJobs() — chamado pelo cron horário.
 */
import type { MessageJob, MessageJobStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { sendText } from "@/server/wuzapi";

import {
  clampToWindow,
  computeAppointmentSchedule,
  computeNoShowSchedule,
  computeWelcomeSchedule,
} from "./schedule";
import {
  WELCOME_LAST_KEY,
  WELCOME_KEYS,
  firstName,
  formatBrDate,
  formatBrTime,
  getTemplate,
  renderTemplate,
  type TemplateVars,
} from "./templates";

const PROCESS_BATCH_SIZE = 50;

// ──────────────────────────────────────────────────────────────────────────
// Enqueue: Etapa Novo Lead (8 mensagens)
// ──────────────────────────────────────────────────────────────────────────

export type EnqueueResult =
  | { kind: "created"; count: number }
  | { kind: "exists" }
  | { kind: "skipped"; reason: string };

export async function enqueueWelcomeSequence(
  leadId: string,
  start: Date = new Date(),
): Promise<EnqueueResult> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, tenantId: true, phone: true },
  });
  if (!lead) return { kind: "skipped", reason: "lead não encontrado" };
  if (!lead.phone) return { kind: "skipped", reason: "lead sem telefone" };

  // Welcome não tem experimentalClassId → unique constraint não impede 2x.
  // Checagem manual antes de inserir.
  const existing = await prisma.messageJob.findFirst({
    where: { leadId, templateKey: { startsWith: "welcome." }, experimentalClassId: null },
    select: { id: true },
  });
  if (existing) return { kind: "exists" };

  const schedule = computeWelcomeSchedule(start);
  await prisma.messageJob.createMany({
    data: WELCOME_KEYS.map((templateKey, i) => ({
      tenantId: lead.tenantId,
      leadId: lead.id,
      templateKey,
      scheduledAt: schedule[i]!,
    })),
    skipDuplicates: true,
  });
  return { kind: "created", count: schedule.length };
}

// ──────────────────────────────────────────────────────────────────────────
// Enqueue: Agendamento
// ──────────────────────────────────────────────────────────────────────────

export async function enqueueAppointmentReminders(params: {
  leadId: string;
  classId: string;
  scheduledFor: Date;
  now?: Date;
}): Promise<{ created: number; skippedSlots: number }> {
  const { leadId, classId, scheduledFor, now = new Date() } = params;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, tenantId: true, phone: true },
  });
  if (!lead) return { created: 0, skippedSlots: 0 };
  if (!lead.phone) return { created: 0, skippedSlots: 4 };

  const sched = computeAppointmentSchedule(scheduledFor, now);

  type Plan = { key: string; at: Date | null };
  const plan: Plan[] = [
    { key: "appointment.confirm", at: sched.confirm },
    { key: "appointment.d-1", at: sched.dMinus1 },
    { key: "appointment.d-0", at: sched.dZero },
    { key: "appointment.1h-before", at: sched.oneHourBefore },
  ];

  const toCreate = plan.filter((p): p is { key: string; at: Date } => p.at !== null);
  const skippedSlots = plan.length - toCreate.length;

  if (toCreate.length === 0) return { created: 0, skippedSlots };

  // skipDuplicates respeita a unique (leadId, templateKey, experimentalClassId).
  const result = await prisma.messageJob.createMany({
    data: toCreate.map((p) => ({
      tenantId: lead.tenantId,
      leadId: lead.id,
      experimentalClassId: classId,
      templateKey: p.key,
      scheduledAt: clampToWindow(p.at),
    })),
    skipDuplicates: true,
  });
  return { created: result.count, skippedSlots };
}

export async function cancelAppointmentJobs(
  classId: string,
  reason: string,
): Promise<{ paused: number }> {
  const result = await prisma.messageJob.updateMany({
    where: { experimentalClassId: classId, status: "PENDING" },
    data: { status: "SKIPPED", errorMessage: reason },
  });
  return { paused: result.count };
}

export async function enqueueNoShowSequence(params: {
  leadId: string;
  classId: string;
  scheduledFor: Date;
}): Promise<{ created: number }> {
  const { leadId, classId, scheduledFor } = params;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, tenantId: true, phone: true },
  });
  if (!lead || !lead.phone) return { created: 0 };

  const { noShow1, noShow2, noShow3 } = computeNoShowSchedule(scheduledFor);
  const result = await prisma.messageJob.createMany({
    data: [
      { key: "appointment.no-show-1", at: noShow1 },
      { key: "appointment.no-show-2", at: noShow2 },
      { key: "appointment.no-show-3", at: noShow3 },
    ].map((x) => ({
      tenantId: lead.tenantId,
      leadId: lead.id,
      experimentalClassId: classId,
      templateKey: x.key,
      scheduledAt: clampToWindow(x.at),
    })),
    skipDuplicates: true,
  });
  return { created: result.count };
}

// ──────────────────────────────────────────────────────────────────────────
// Enqueue: imediato (1 mensagem only)
// ──────────────────────────────────────────────────────────────────────────

export async function enqueueImmediate(params: {
  leadId: string;
  classId?: string | null;
  templateKey: string;
  delayMs?: number;
}): Promise<EnqueueResult> {
  const { leadId, classId, templateKey, delayMs = 0 } = params;
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { id: true, tenantId: true, phone: true },
  });
  if (!lead) return { kind: "skipped", reason: "lead não encontrado" };
  if (!lead.phone) return { kind: "skipped", reason: "lead sem telefone" };

  // Idempotência sem unique (quando classId é null): checagem manual.
  if (!classId) {
    const existing = await prisma.messageJob.findFirst({
      where: { leadId, templateKey, experimentalClassId: null },
      select: { id: true },
    });
    if (existing) return { kind: "exists" };
  }

  const scheduledAt = clampToWindow(new Date(Date.now() + delayMs));
  await prisma.messageJob.create({
    data: {
      tenantId: lead.tenantId,
      leadId: lead.id,
      experimentalClassId: classId ?? null,
      templateKey,
      scheduledAt,
    },
  });
  return { kind: "created", count: 1 };
}

// ──────────────────────────────────────────────────────────────────────────
// Pause
// ──────────────────────────────────────────────────────────────────────────

type PauseScope =
  | { kind: "all" } // pausa tudo do lead
  | { kind: "welcome" } // só Etapa Novo Lead
  | { kind: "appointment"; classId: string };

/**
 * Marca jobs PENDING do lead como SKIPPED. Por padrão pausa TUDO — mas
 * o caller pode restringir o escopo (ex: só lembretes de uma AE específica).
 */
export async function pauseLeadJobs(
  leadId: string,
  reason: string,
  scope: PauseScope = { kind: "all" },
): Promise<{ paused: number }> {
  const where: { leadId: string; status: MessageJobStatus; templateKey?: { startsWith: string }; experimentalClassId?: string } = {
    leadId,
    status: "PENDING",
  };
  if (scope.kind === "welcome") {
    where.templateKey = { startsWith: "welcome." };
  } else if (scope.kind === "appointment") {
    where.experimentalClassId = scope.classId;
  }
  const result = await prisma.messageJob.updateMany({ where, data: { status: "SKIPPED", errorMessage: reason } });
  return { paused: result.count };
}

// ──────────────────────────────────────────────────────────────────────────
// Process (cron)
// ──────────────────────────────────────────────────────────────────────────

type ProcessSummary = {
  scanned: number;
  sent: number;
  failed: number;
  skipped: number;
  movedToNutricao: number;
};

export async function processDueJobs(now: Date = new Date()): Promise<ProcessSummary> {
  const summary: ProcessSummary = {
    scanned: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    movedToNutricao: 0,
  };

  const jobs = await prisma.messageJob.findMany({
    where: { status: "PENDING", scheduledAt: { lte: now } },
    orderBy: { scheduledAt: "asc" },
    take: PROCESS_BATCH_SIZE,
    include: {
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          tenantId: true,
          stage: { select: { name: true } },
          assignedSeller: { select: { name: true } },
        },
      },
      tenant: {
        select: {
          id: true,
          name: true,
          wuzapiUrl: true,
          wuzapiToken: true,
          followUpEnabled: true,
        },
      },
      experimentalClass: {
        select: {
          id: true,
          scheduledDate: true,
          status: true,
          modality: { select: { name: true } },
        },
      },
    },
  });
  summary.scanned = jobs.length;

  for (const job of jobs) {
    const outcome = await processSingleJob(job, now);
    summary[outcome]++;
  }

  return summary;
}

type JobWithIncludes = Awaited<ReturnType<typeof prisma.messageJob.findMany>>[number] & {
  lead: { id: string; name: string; phone: string | null; tenantId: string; stage: { name: string }; assignedSeller: { name: string | null } | null };
  tenant: { id: string; name: string; wuzapiUrl: string | null; wuzapiToken: string | null; followUpEnabled: boolean };
  experimentalClass: { id: string; scheduledDate: Date; status: string; modality: { name: string } } | null;
};

type Outcome = "sent" | "failed" | "skipped" | "movedToNutricao";

async function processSingleJob(job: JobWithIncludes, now: Date): Promise<Outcome> {
  const { lead, tenant, experimentalClass } = job;

  if (!tenant.followUpEnabled) {
    await prisma.messageJob.update({
      where: { id: job.id },
      data: { status: "SKIPPED", errorMessage: "tenant.followUpEnabled=false" },
    });
    return "skipped";
  }
  if (!tenant.wuzapiUrl || !tenant.wuzapiToken) {
    await prisma.messageJob.update({
      where: { id: job.id },
      data: { status: "SKIPPED", errorMessage: "tenant sem credenciais Wuzapi" },
    });
    return "skipped";
  }
  if (!lead.phone) {
    await prisma.messageJob.update({
      where: { id: job.id },
      data: { status: "SKIPPED", errorMessage: "lead sem telefone" },
    });
    return "skipped";
  }

  // Defesa por categoria — welcome só faz sentido em Novo Lead; agendamento
  // só se a AE ainda está SCHEDULED/CONFIRMED.
  if (job.templateKey.startsWith("welcome.") && lead.stage.name !== "Novo Lead") {
    await prisma.messageJob.update({
      where: { id: job.id },
      data: { status: "SKIPPED", errorMessage: `lead saiu de Novo Lead → "${lead.stage.name}"` },
    });
    return "skipped";
  }
  if (job.templateKey.startsWith("appointment.") && experimentalClass) {
    const aeCanceled = experimentalClass.status === "CANCELED";
    const isReminder =
      job.templateKey === "appointment.d-1" ||
      job.templateKey === "appointment.d-0" ||
      job.templateKey === "appointment.1h-before";
    if (aeCanceled && isReminder) {
      await prisma.messageJob.update({
        where: { id: job.id },
        data: { status: "SKIPPED", errorMessage: "AE cancelada" },
      });
      return "skipped";
    }
  }

  const template = getTemplate(job.templateKey);
  if (!template) {
    await prisma.messageJob.update({
      where: { id: job.id },
      data: { status: "FAILED", errorMessage: `template "${job.templateKey}" não encontrado` },
    });
    return "failed";
  }

  const vars: TemplateVars = {
    nome: firstName(lead.name),
    atendente: lead.assignedSeller?.name ?? "equipe Gracie Barra",
    academia: tenant.name,
  };
  if (experimentalClass) {
    vars.dia = formatBrDate(experimentalClass.scheduledDate);
    vars.horario = formatBrTime(experimentalClass.scheduledDate);
    vars.modalidade = experimentalClass.modality.name;
  }

  const body = renderTemplate(template.body, vars);

  const result = await sendText(
    { url: tenant.wuzapiUrl, token: tenant.wuzapiToken },
    { phone: lead.phone, body },
  );

  if (result.ok) {
    await prisma.messageJob.update({
      where: { id: job.id },
      data: { status: "SENT", sentAt: new Date(), renderedBody: body },
    });

    // Após M8 (encerramento welcome), move pra Nutrição.
    if (job.templateKey === WELCOME_LAST_KEY) {
      const moved = await moveLeadToNutricao(lead.id, tenant.id);
      if (moved) return "movedToNutricao";
    }
    return "sent";
  }

  const retryable = result.kind === "network" || result.kind === "server";
  await prisma.messageJob.update({
    where: { id: job.id },
    data: retryable
      ? {
          scheduledAt: new Date(now.getTime() + 30 * 60 * 1000),
          errorMessage: `[retry] ${result.message}`,
        }
      : { status: "FAILED", errorMessage: result.message },
  });
  return retryable ? "skipped" : "failed";
}

async function moveLeadToNutricao(leadId: string, tenantId: string): Promise<boolean> {
  const nutricao = await prisma.stage.findFirst({
    where: { tenantId, name: "Nutrição", active: true },
    select: { id: true },
  });
  if (!nutricao) return false;

  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: { stageId: true, tags: true },
  });
  if (!lead) return false;

  const tags = lead.tags.includes("Não respondeu")
    ? lead.tags
    : [...lead.tags, "Não respondeu"];

  await prisma.$transaction([
    prisma.lead.update({
      where: { id: leadId },
      data: { stageId: nutricao.id, tags },
    }),
    prisma.stageHistory.create({
      data: {
        leadId,
        fromStageId: lead.stageId,
        toStageId: nutricao.id,
        notes: "Movido automaticamente após M8 sem resposta",
      },
    }),
  ]);
  return true;
}

// Necessário pra silenciar warning de import não-usado quando o type só é usado
// em parâmetro (ts-strict).
export type { MessageJob };

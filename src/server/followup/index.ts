/**
 * Orquestração do follow-up de Novo Lead:
 *
 *   enqueueWelcomeSequence(leadId)  — chamado quando lead chega via Chatwoot.
 *                                     Cria 8 FollowUpJob (pending) com
 *                                     scheduledAt da cadência.
 *
 *   pauseLeadJobs(leadId, reason)   — chamado quando lead responde, é movido
 *                                     de stage, ou cai em Ganho/Perda.
 *                                     Marca todos os pending como SKIPPED.
 *
 *   processDueJobs()                — chamado pelo cron horário. Pega até N
 *                                     jobs com scheduledAt <= now, manda via
 *                                     Wuzapi, marca SENT/FAILED. Após M8
 *                                     bem-sucedido, move lead pra Nutrição
 *                                     com tag "Não respondeu".
 */
import { prisma } from "@/lib/prisma";
import { sendText } from "@/server/wuzapi";

import { computeSequenceSchedule } from "./schedule";
import {
  NOVO_LEAD_TEMPLATES,
  NOVO_LEAD_TOTAL_STEPS,
  firstName,
  renderTemplate,
} from "./templates";

const PROCESS_BATCH_SIZE = 50;

// ──────────────────────────────────────────────────────────────────────────
// Enqueue
// ──────────────────────────────────────────────────────────────────────────

export type EnqueueResult =
  | { kind: "created"; count: number }
  | { kind: "exists" }
  | { kind: "skipped"; reason: string };

/**
 * Cria 8 jobs pra um lead. Idempotente: se já existir job pra esse lead,
 * retorna `exists` sem mexer. NÃO checa stage do lead — o caller (handler
 * do Chatwoot) só chama em lead recém-criado.
 */
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

  const existing = await prisma.followUpJob.findFirst({
    where: { leadId },
    select: { id: true },
  });
  if (existing) return { kind: "exists" };

  const schedule = computeSequenceSchedule(start);
  await prisma.followUpJob.createMany({
    data: schedule.map((scheduledAt, i) => ({
      tenantId: lead.tenantId,
      leadId: lead.id,
      sequenceStep: i + 1,
      scheduledAt,
    })),
    skipDuplicates: true,
  });
  return { kind: "created", count: schedule.length };
}

// ──────────────────────────────────────────────────────────────────────────
// Pause
// ──────────────────────────────────────────────────────────────────────────

/**
 * Marca todos os jobs PENDING do lead como SKIPPED. Usado quando o lead
 * respondeu, foi movido manualmente, etc.
 */
export async function pauseLeadJobs(
  leadId: string,
  reason: string,
): Promise<{ paused: number }> {
  const result = await prisma.followUpJob.updateMany({
    where: { leadId, status: "PENDING" },
    data: { status: "SKIPPED", errorMessage: reason },
  });
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

/**
 * Cron handler. Pega jobs vencidos, manda mensagem, atualiza status.
 * Limite de batch evita timeout em backlog grande.
 */
export async function processDueJobs(now: Date = new Date()): Promise<ProcessSummary> {
  const summary: ProcessSummary = {
    scanned: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
    movedToNutricao: 0,
  };

  const jobs = await prisma.followUpJob.findMany({
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
          stage: { select: { name: true, isWon: true, isLost: true } },
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
    },
  });
  summary.scanned = jobs.length;

  for (const job of jobs) {
    const { lead, tenant } = job;

    // Skip se tenant desabilitou follow-up ou está sem credencial.
    if (!tenant.followUpEnabled) {
      await prisma.followUpJob.update({
        where: { id: job.id },
        data: { status: "SKIPPED", errorMessage: "tenant.followUpEnabled=false" },
      });
      summary.skipped++;
      continue;
    }
    if (!tenant.wuzapiUrl || !tenant.wuzapiToken) {
      await prisma.followUpJob.update({
        where: { id: job.id },
        data: { status: "SKIPPED", errorMessage: "tenant sem credenciais Wuzapi" },
      });
      summary.skipped++;
      continue;
    }

    // Skip se lead saiu de Novo Lead (foi pra Potencial, Ganho, Perda, etc).
    // A pausa por resposta já vem do handler Chatwoot, mas defendemos aqui também.
    if (lead.stage.name !== "Novo Lead") {
      await prisma.followUpJob.update({
        where: { id: job.id },
        data: { status: "SKIPPED", errorMessage: `lead já em stage "${lead.stage.name}"` },
      });
      summary.skipped++;
      continue;
    }

    if (!lead.phone) {
      await prisma.followUpJob.update({
        where: { id: job.id },
        data: { status: "SKIPPED", errorMessage: "lead sem telefone" },
      });
      summary.skipped++;
      continue;
    }

    const template = NOVO_LEAD_TEMPLATES.find((t) => t.step === job.sequenceStep);
    if (!template) {
      await prisma.followUpJob.update({
        where: { id: job.id },
        data: { status: "FAILED", errorMessage: `template step ${job.sequenceStep} não encontrado` },
      });
      summary.failed++;
      continue;
    }

    const body = renderTemplate(template.body, {
      nome: firstName(lead.name),
      atendente: lead.assignedSeller?.name ?? "equipe Gracie Barra",
      academia: tenant.name,
    });

    const result = await sendText(
      { url: tenant.wuzapiUrl, token: tenant.wuzapiToken },
      { phone: lead.phone, body },
    );

    if (result.ok) {
      await prisma.followUpJob.update({
        where: { id: job.id },
        data: {
          status: "SENT",
          sentAt: new Date(),
          renderedBody: body,
        },
      });
      summary.sent++;

      // Após a M8 (encerramento), move o lead pra Nutrição + tag "Não respondeu".
      if (job.sequenceStep === NOVO_LEAD_TOTAL_STEPS) {
        const movedOk = await moveLeadToNutricao(lead.id, tenant.id);
        if (movedOk) summary.movedToNutricao++;
      }
    } else {
      // Network/server errors → mantém PENDING pro próximo run (reschedule +30min)
      // Auth/client errors → FAILED (não vai resolver sozinho)
      const isRetryable = result.kind === "network" || result.kind === "server";
      await prisma.followUpJob.update({
        where: { id: job.id },
        data: isRetryable
          ? {
              scheduledAt: new Date(now.getTime() + 30 * 60 * 1000),
              errorMessage: `[retry] ${result.message}`,
            }
          : {
              status: "FAILED",
              errorMessage: result.message,
            },
      });
      if (isRetryable) summary.skipped++;
      else summary.failed++;
    }
  }

  return summary;
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

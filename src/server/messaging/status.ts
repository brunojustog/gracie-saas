/**
 * Snapshot do follow-up de UM lead. Usado pelo badge no card do kanban e
 * pela aba "Follow-up" do sheet.
 *
 * `summary` é o estado agregado pra exibição compacta:
 *   - "idle"      → sem cadência ativa (lead sem welcome enfileirado)
 *   - "running"   → welcome em andamento. `currentStep`/`totalSteps` setados.
 *   - "paused"    → followUpEnabled=false no lead (override manual)
 *   - "tenantOff" → tenant.followUpEnabled=false (master switch off)
 *   - "completed" → welcome inteiro enviado (M1..M8) sem o lead responder.
 *                   Nessa altura `moveLeadToNutricao` já moveu o card.
 *   - "responded" → todos pendentes foram SKIPPED por "lead respondeu via
 *                   Chatwoot" (cadência pausada por reação do lead).
 *   - "failed"    → último job terminou em FAILED sem retry.
 *
 * `timeline` lista os jobs welcome.m1..m8 em ordem (1..8), preenchidos com
 * o MessageJob correspondente quando existe. Slots vazios viram null —
 * permite renderizar "Welcome M3 de 8" mesmo se M4..M8 ainda não foram
 * agendados por algum motivo.
 */
import type { MessageJob } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { WELCOME_KEYS } from "./templates";

export type WelcomeSlot = {
  step: number;
  templateKey: string;
  job: Pick<
    MessageJob,
    "id" | "status" | "scheduledAt" | "sentAt" | "errorMessage"
  > | null;
};

export type AppointmentJob = Pick<
  MessageJob,
  "id" | "templateKey" | "status" | "scheduledAt" | "sentAt" | "errorMessage"
> & { experimentalClassId: string };

export type AttendanceJob = Pick<
  MessageJob,
  "id" | "templateKey" | "status" | "scheduledAt" | "sentAt" | "errorMessage"
>;

export type FollowUpSummary =
  | "idle"
  | "running"
  | "paused"
  | "tenantOff"
  | "completed"
  | "responded"
  | "failed";

export type FollowUpStatus = {
  leadId: string;
  enabledForLead: boolean;
  enabledForTenant: boolean;
  summary: FollowUpSummary;
  /** Próximo passo numerado da cadência welcome (1..8) ou null se não há próximo. */
  currentStep: number | null;
  totalSteps: number;
  /** Próxima mensagem agendada (qualquer categoria), ou null. */
  nextScheduledAt: Date | null;
  welcome: WelcomeSlot[];
  appointment: AppointmentJob[];
  attendance: AttendanceJob[];
};

const WELCOME_TOTAL = WELCOME_KEYS.length;

/**
 * Decide o summary a partir dos jobs welcome. Ordem importa:
 *   1. Master switch do tenant off → "tenantOff"
 *   2. Toggle do lead off → "paused"
 *   3. Sem jobs welcome → "idle"
 *   4. Todos welcome SENT → "completed"
 *   5. Todos welcome SKIPPED com motivo "respondeu" → "responded"
 *   6. Algum welcome FAILED e nenhum PENDING → "failed"
 *   7. Default → "running"
 */
function resolveSummary(
  enabledForLead: boolean,
  enabledForTenant: boolean,
  welcome: WelcomeSlot[],
): FollowUpSummary {
  if (!enabledForTenant) return "tenantOff";
  if (!enabledForLead) return "paused";

  const jobs = welcome.map((w) => w.job).filter((j): j is NonNullable<typeof j> => j !== null);
  if (jobs.length === 0) return "idle";

  const allSent = jobs.every((j) => j.status === "SENT");
  if (allSent && jobs.length === WELCOME_TOTAL) return "completed";

  const respondedCount = jobs.filter(
    (j) => j.status === "SKIPPED" && j.errorMessage?.toLowerCase().includes("respondeu"),
  ).length;
  const pending = jobs.filter((j) => j.status === "PENDING").length;
  if (respondedCount > 0 && pending === 0) return "responded";

  const hasFailed = jobs.some((j) => j.status === "FAILED");
  if (hasFailed && pending === 0) return "failed";

  return "running";
}

export async function getLeadFollowUpStatus(leadId: string): Promise<FollowUpStatus | null> {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      followUpEnabled: true,
      tenant: { select: { followUpEnabled: true } },
      messageJobs: {
        orderBy: { scheduledAt: "asc" },
        select: {
          id: true,
          templateKey: true,
          status: true,
          scheduledAt: true,
          sentAt: true,
          errorMessage: true,
          experimentalClassId: true,
        },
      },
    },
  });
  if (!lead) return null;

  const welcomeByKey = new Map(
    lead.messageJobs
      .filter((j) => j.templateKey.startsWith("welcome."))
      .map((j) => [j.templateKey, j] as const),
  );

  const welcome: WelcomeSlot[] = WELCOME_KEYS.map((key, i) => {
    const job = welcomeByKey.get(key);
    return {
      step: i + 1,
      templateKey: key,
      job: job
        ? {
            id: job.id,
            status: job.status,
            scheduledAt: job.scheduledAt,
            sentAt: job.sentAt,
            errorMessage: job.errorMessage,
          }
        : null,
    };
  });

  const appointment: AppointmentJob[] = lead.messageJobs
    .filter(
      (j): j is typeof j & { experimentalClassId: string } =>
        j.templateKey.startsWith("appointment.") && j.experimentalClassId !== null,
    )
    .map((j) => ({
      id: j.id,
      templateKey: j.templateKey,
      status: j.status,
      scheduledAt: j.scheduledAt,
      sentAt: j.sentAt,
      errorMessage: j.errorMessage,
      experimentalClassId: j.experimentalClassId,
    }));

  const attendance: AttendanceJob[] = lead.messageJobs
    .filter((j) => j.templateKey.startsWith("attendance."))
    .map((j) => ({
      id: j.id,
      templateKey: j.templateKey,
      status: j.status,
      scheduledAt: j.scheduledAt,
      sentAt: j.sentAt,
      errorMessage: j.errorMessage,
    }));

  const summary = resolveSummary(lead.followUpEnabled, lead.tenant.followUpEnabled, welcome);

  // currentStep: primeiro slot welcome ainda PENDING (1-indexed). Se já passou
  // de M8 ou cadência inteira terminou, fica null.
  const firstPending = welcome.find((w) => w.job?.status === "PENDING");
  const currentStep = firstPending?.step ?? null;

  const futureJobs = lead.messageJobs.filter(
    (j) => j.status === "PENDING" && j.scheduledAt.getTime() > Date.now(),
  );
  const nextScheduledAt =
    futureJobs.length > 0
      ? futureJobs.reduce((min, j) => (j.scheduledAt < min ? j.scheduledAt : min), futureJobs[0]!.scheduledAt)
      : null;

  return {
    leadId: lead.id,
    enabledForLead: lead.followUpEnabled,
    enabledForTenant: lead.tenant.followUpEnabled,
    summary,
    currentStep,
    totalSteps: WELCOME_TOTAL,
    nextScheduledAt,
    welcome,
    appointment,
    attendance,
  };
}

/**
 * Versão batch otimizada pra hidratar o kanban. Faz 1 query única que traz
 * tenant.followUpEnabled + todos os welcome jobs de todos os leads passados.
 * Retorna um Map (leadId → FollowUpSummary curto) — só o que o badge do card
 * precisa, não a timeline completa.
 */
export type LeadCardFollowUp = {
  enabled: boolean;
  summary: FollowUpSummary;
  currentStep: number | null;
  totalSteps: number;
};

export async function getFollowUpSummariesForLeads(
  tenantId: string,
  leadIds: string[],
): Promise<Map<string, LeadCardFollowUp>> {
  const out = new Map<string, LeadCardFollowUp>();
  if (leadIds.length === 0) return out;

  const [tenant, leads] = await Promise.all([
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { followUpEnabled: true },
    }),
    prisma.lead.findMany({
      where: { id: { in: leadIds }, tenantId },
      select: {
        id: true,
        followUpEnabled: true,
        messageJobs: {
          where: { templateKey: { startsWith: "welcome." } },
          orderBy: { scheduledAt: "asc" },
          select: {
            templateKey: true,
            status: true,
            scheduledAt: true,
            sentAt: true,
            errorMessage: true,
          },
        },
      },
    }),
  ]);

  const tenantEnabled = tenant?.followUpEnabled ?? false;

  for (const lead of leads) {
    const welcome: WelcomeSlot[] = WELCOME_KEYS.map((key, i) => {
      const job = lead.messageJobs.find((j) => j.templateKey === key);
      return {
        step: i + 1,
        templateKey: key,
        job: job
          ? {
              id: "",
              status: job.status,
              scheduledAt: job.scheduledAt,
              sentAt: job.sentAt,
              errorMessage: job.errorMessage,
            }
          : null,
      };
    });

    const summary = resolveSummary(lead.followUpEnabled, tenantEnabled, welcome);
    const firstPending = welcome.find((w) => w.job?.status === "PENDING");

    out.set(lead.id, {
      enabled: lead.followUpEnabled,
      summary,
      currentStep: firstPending?.step ?? null,
      totalSteps: WELCOME_TOTAL,
    });
  }

  return out;
}

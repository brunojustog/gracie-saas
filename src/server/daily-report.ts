/**
 * Resumo diário do Quadro do Vitor enviado por WhatsApp (v1.1-BH).
 *
 * Disparado pelo cron `/api/cron/daily-quadro` às 22h (America/Sao_Paulo).
 * Pra cada tenant com `dailyReportPhones` e WuzAPI configurados: monta um
 * digest do DIA (sem valores em R$) + o link público do Quadro e envia.
 */
import { randomUUID } from "crypto";

import { endOfDay, format, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";

import { prisma } from "@/lib/prisma";
import { sendText } from "@/server/wuzapi";

/** Contadores do dia corrente (fuso do container = America/Sao_Paulo). */
export async function getDailyDigest(tenantId: string, now: Date = new Date()) {
  const dayStart = startOfDay(now);
  const dayEnd = endOfDay(now);
  const live = { lead: { deletedAt: null } };

  const [
    matriculasHoje,
    cancelamentosHoje,
    experimentaisHoje,
    compareceramHoje,
    avulsasHoje,
    ativosTotal,
  ] = await Promise.all([
    prisma.enrollment.count({
      where: { tenantId, ...live, enrolledAt: { gte: dayStart, lte: dayEnd } },
    }),
    prisma.enrollment.count({
      where: {
        tenantId,
        ...live,
        status: { in: ["CANCELED", "JUDICIAL"] },
        canceledAt: { gte: dayStart, lte: dayEnd },
      },
    }),
    prisma.experimentalClass.count({
      where: {
        tenantId,
        status: { not: "CANCELED" },
        scheduledDate: { gte: dayStart, lte: dayEnd },
      },
    }),
    prisma.experimentalClass.count({
      where: {
        tenantId,
        status: "ATTENDED",
        scheduledDate: { gte: dayStart, lte: dayEnd },
      },
    }),
    prisma.looseClass.count({
      where: { tenantId, classDate: { gte: dayStart, lte: dayEnd } },
    }),
    prisma.enrollment.count({
      where: { tenantId, ...live, status: "ACTIVE" },
    }),
  ]);

  return {
    matriculasHoje,
    cancelamentosHoje,
    experimentaisHoje,
    compareceramHoje,
    avulsasHoje,
    ativosTotal,
  };
}

function buildMessage(
  tenantName: string,
  digest: Awaited<ReturnType<typeof getDailyDigest>>,
  link: string,
  now: Date,
): string {
  return [
    `📊 *Quadro do dia — ${tenantName}*`,
    format(now, "EEEE, dd/MM/yyyy", { locale: ptBR }),
    "",
    `✅ Matrículas hoje: ${digest.matriculasHoje}`,
    `❌ Cancelamentos hoje: ${digest.cancelamentosHoje}`,
    `🥋 Experimentais hoje: ${digest.experimentaisHoje} (${digest.compareceramHoje} compareceram)`,
    `🎟️ Aulas avulsas hoje: ${digest.avulsasHoje}`,
    `👥 Alunos ativos: ${digest.ativosTotal}`,
    "",
    "Ver o quadro completo (sem login):",
    link,
  ].join("\n");
}

export type DailyReportSummary = {
  tenants: number;
  sent: number;
  failed: number;
};

/**
 * Envia o resumo diário pra todos os tenants configurados. Idempotente o
 * suficiente pra rodar 1x/dia; se chamado mais vezes, reenvia (o cron controla
 * a frequência).
 */
export async function sendDailyQuadroReports(
  now: Date = new Date(),
): Promise<DailyReportSummary> {
  const baseUrl = (process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "");

  const tenants = await prisma.tenant.findMany({
    where: {
      active: true,
      wuzapiUrl: { not: null },
      wuzapiToken: { not: null },
      dailyReportPhones: { isEmpty: false },
    },
    select: {
      id: true,
      name: true,
      wuzapiUrl: true,
      wuzapiToken: true,
      publicQuadroToken: true,
      dailyReportPhones: true,
    },
  });

  let sent = 0;
  let failed = 0;

  for (const t of tenants) {
    // Garante um link público válido (gera se não existir).
    let token = t.publicQuadroToken;
    if (!token) {
      token = randomUUID().replace(/-/g, "");
      await prisma.tenant.update({
        where: { id: t.id },
        data: { publicQuadroToken: token },
      });
    }

    const digest = await getDailyDigest(t.id, now);
    const link = `${baseUrl}/p/quadro/${token}`;
    const body = buildMessage(t.name, digest, link, now);
    const creds = { url: t.wuzapiUrl!, token: t.wuzapiToken! };

    for (const phone of t.dailyReportPhones) {
      const res = await sendText(creds, { phone, body });
      if (res.ok) sent++;
      else {
        failed++;
        console.error(
          `[daily-quadro] falha ao enviar pra ${phone} (${t.name}): ${res.message}`,
        );
      }
    }
  }

  return { tenants: tenants.length, sent, failed };
}

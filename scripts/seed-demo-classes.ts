/**
 * Cria aulas experimentais de exemplo distribuídas em estados variados,
 * pra testar o calendário visualmente e o cálculo de KPIs futuros.
 *
 * Idempotente: dedup por (leadId, scheduledDate).
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type ExperimentalClassStatus } from "@prisma/client";
import { addDays, setHours, setMinutes, startOfWeek } from "date-fns";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type Demo = {
  leadName: string;
  modalityName: string;
  /** Offset em dias a partir do início da semana atual (0=segunda, 1=terça…). */
  dayOffset: number;
  hour: number;
  minute: number;
  status: ExperimentalClassStatus;
  notes?: string;
};

const DEMO: Demo[] = [
  // Aulas passadas (semanas anteriores)
  { leadName: "Thiago Mendes", modalityName: "GB1", dayOffset: -7, hour: 19, minute: 30, status: "ATTENDED", notes: "Compareceu, demonstrou interesse" },
  { leadName: "Rodrigo Castro", modalityName: "GB1", dayOffset: -2, hour: 19, minute: 30, status: "ATTENDED" },
  { leadName: "Juliana Pires", modalityName: "GBF", dayOffset: -1, hour: 19, minute: 30, status: "ATTENDED", notes: "Quer começar semana que vem" },
  { leadName: "Marcelo Andrade", modalityName: "GB1", dayOffset: -3, hour: 20, minute: 30, status: "NO_SHOW" },

  // Aulas dessa semana / próxima
  { leadName: "Aline Ferreira", modalityName: "BarraFit", dayOffset: 1, hour: 17, minute: 30, status: "CONFIRMED" },
  { leadName: "Família Oliveira (filha 11 anos)", modalityName: "GBK - Juniors", dayOffset: 2, hour: 18, minute: 30, status: "CONFIRMED" },
  { leadName: "Diego Martins", modalityName: "GB1", dayOffset: 3, hour: 19, minute: 30, status: "SCHEDULED" },
  { leadName: "Patrícia Nunes", modalityName: "GBF", dayOffset: 3, hour: 19, minute: 30, status: "SCHEDULED" },
  { leadName: "Henrique Souza", modalityName: "GBA", dayOffset: 1, hour: 17, minute: 30, status: "SCHEDULED" },
];

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "gracie" } });
  if (!tenant) throw new Error("tenant 'gracie' não existe — rode `npm run db:seed`.");

  const [leads, modalities] = await Promise.all([
    prisma.lead.findMany({ where: { tenantId: tenant.id } }),
    prisma.modality.findMany({ where: { tenantId: tenant.id } }),
  ]);
  const leadByName = new Map(leads.map((l) => [l.name, l]));
  const modalityByName = new Map(modalities.map((m) => [m.name, m]));

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

  let created = 0;
  let updated = 0;

  for (const d of DEMO) {
    const lead = leadByName.get(d.leadName);
    if (!lead) {
      console.warn(`  · pulando: lead "${d.leadName}" não existe (rode db:demo-leads antes)`);
      continue;
    }
    const modality = modalityByName.get(d.modalityName);
    if (!modality) {
      console.warn(`  · pulando: modalidade "${d.modalityName}" não existe`);
      continue;
    }
    const scheduledDate = setMinutes(
      setHours(addDays(weekStart, d.dayOffset), d.hour),
      d.minute,
    );

    const existing = await prisma.experimentalClass.findFirst({
      where: { tenantId: tenant.id, leadId: lead.id, scheduledDate },
    });
    if (existing) {
      await prisma.experimentalClass.update({
        where: { id: existing.id },
        data: {
          modalityId: modality.id,
          status: d.status,
          notes: d.notes ?? null,
          attendedAt: d.status === "ATTENDED" ? scheduledDate : null,
        },
      });
      updated++;
    } else {
      await prisma.experimentalClass.create({
        data: {
          tenantId: tenant.id,
          leadId: lead.id,
          modalityId: modality.id,
          scheduledDate,
          status: d.status,
          notes: d.notes ?? null,
          attendedAt: d.status === "ATTENDED" ? scheduledDate : null,
        },
      });
      created++;
    }
  }

  console.log(`✓ Demo aulas: ${created} criadas, ${updated} atualizadas`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

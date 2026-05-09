/**
 * Cria matrícula de exemplo pra um dos leads que estão no stage "Matriculado".
 * Idempotente — Lead.enrollment é unique, segundo run vira no-op.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "gracie" } });
  if (!tenant) throw new Error("tenant não existe — rode `npm run db:seed`.");

  const lead = await prisma.lead.findFirst({
    where: { tenantId: tenant.id, name: "Thiago Mendes" },
  });
  if (!lead) {
    console.warn("lead 'Thiago Mendes' não existe — rode `npm run db:demo-leads`.");
    return;
  }

  const existing = await prisma.enrollment.findUnique({
    where: { leadId: lead.id },
  });
  if (existing) {
    console.log(`✓ Thiago Mendes já tem matrícula (${existing.status}) — no-op`);
    await prisma.$disconnect();
    return;
  }

  const modality = await prisma.modality.findFirst({
    where: { tenantId: tenant.id, name: "GB1" },
  });
  const plan = await prisma.plan.findFirst({
    where: { tenantId: tenant.id, name: "Plano Mensal" },
  });
  if (!modality || !plan) {
    throw new Error("modalidade/plano padrão não encontrados");
  }

  const enrollment = await prisma.enrollment.create({
    data: {
      tenantId: tenant.id,
      leadId: lead.id,
      modalityId: modality.id,
      planId: plan.id,
      monthlyValue: 599.9,
      paymentMethod: "PIX",
      status: "ACTIVE",
      observations: "Matrícula de exemplo criada via demo seed",
    },
  });

  console.log(
    `✓ Matrícula criada: ${lead.name} → ${modality.name} / ${plan.name} (id=${enrollment.id})`,
  );

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

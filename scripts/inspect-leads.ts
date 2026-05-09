import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  const tenant = await prisma.tenant.findUnique({ where: { slug: "gracie" } });
  if (!tenant) throw new Error("tenant gracie não encontrado");

  const leads = await prisma.lead.findMany({
    where: { tenantId: tenant.id },
    include: { stage: true, history: true },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\nLeads (${leads.length}):`);
  for (const l of leads) {
    console.log(
      `  · ${l.name.padEnd(20)} origin=${String(l.origin).padEnd(18)} stage=${l.stage.name.padEnd(12)} chatwootId=${l.chatwootContactId} histórico=${l.history.length}`,
    );
  }

  const logs = await prisma.webhookLog.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "asc" },
  });
  console.log(`\nWebhookLogs (${logs.length}):`);
  for (const log of logs) {
    console.log(
      `  · ${log.eventType.padEnd(28)} processed=${log.processed} error=${log.error ?? "-"}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

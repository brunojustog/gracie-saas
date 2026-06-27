-- v1.1-BJ: snapshot diário do resumo (faixa "últimos dias" no Quadro público).
CREATE TABLE "DailyReportSnapshot" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "matriculas" INTEGER NOT NULL,
  "cancelamentos" INTEGER NOT NULL,
  "experimentais" INTEGER NOT NULL,
  "compareceram" INTEGER NOT NULL,
  "avulsas" INTEGER NOT NULL,
  "ativos" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DailyReportSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailyReportSnapshot_tenantId_day_key" ON "DailyReportSnapshot"("tenantId", "day");
CREATE INDEX "DailyReportSnapshot_tenantId_day_idx" ON "DailyReportSnapshot"("tenantId", "day");
ALTER TABLE "DailyReportSnapshot" ADD CONSTRAINT "DailyReportSnapshot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

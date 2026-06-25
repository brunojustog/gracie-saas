-- v1.1-BH: destinatários do resumo diário do Quadro no WhatsApp.
ALTER TABLE "Tenant" ADD COLUMN "dailyReportPhones" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

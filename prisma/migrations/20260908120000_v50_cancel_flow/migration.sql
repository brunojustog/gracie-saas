-- v1.2-AP: fluxo de cancelamento em 3 etapas + telefone de aviso (Gisele).
ALTER TABLE "Enrollment" ADD COLUMN "exitFeePaidAt" TIMESTAMP(3);
ALTER TABLE "Enrollment" ADD COLUMN "recurrenceCanceledAt" TIMESTAMP(3);
ALTER TABLE "Tenant" ADD COLUMN "cancelNotifyPhone" TEXT;

-- Número da Gisele (GBAF) — editável depois em Config; pode mudar por tenant.
UPDATE "Tenant" SET "cancelNotifyPhone" = '5511997777693' WHERE slug = 'bgaf';

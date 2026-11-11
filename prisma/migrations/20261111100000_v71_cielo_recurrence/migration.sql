-- v1.3-A: cobrança recorrente da mensalidade no cartão via Cielo
-- (Recorrência Programada da API E-commerce 3.0).

ALTER TYPE "LeadNoteKind" ADD VALUE IF NOT EXISTS 'CIELO_EVENT';

ALTER TABLE "Tenant" ADD COLUMN "cieloEnvironment" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "cieloMerchantId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "cieloMerchantKey" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "cieloSopClientId" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "cieloSopClientSecret" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "cieloWebhookSecret" TEXT;
ALTER TABLE "Tenant" ADD COLUMN "cieloSoftDescriptor" TEXT;

ALTER TABLE "Enrollment" ADD COLUMN "cieloCardLinkToken" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN "cieloCardLinkExpiresAt" TIMESTAMP(3);
ALTER TABLE "Enrollment" ADD COLUMN "cieloRecurrentPaymentId" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN "cieloRecurrenceStatus" INTEGER;
ALTER TABLE "Enrollment" ADD COLUMN "cieloCardMasked" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN "cieloCardBrand" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN "cieloLastError" TEXT;
ALTER TABLE "Enrollment" ADD COLUMN "cieloSyncedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "Enrollment_cieloCardLinkToken_key" ON "Enrollment"("cieloCardLinkToken");
CREATE UNIQUE INDEX "Enrollment_cieloRecurrentPaymentId_key" ON "Enrollment"("cieloRecurrentPaymentId");

ALTER TABLE "PaymentRecord" ADD COLUMN "cieloPaymentId" TEXT;
CREATE UNIQUE INDEX "PaymentRecord_cieloPaymentId_key" ON "PaymentRecord"("cieloPaymentId");

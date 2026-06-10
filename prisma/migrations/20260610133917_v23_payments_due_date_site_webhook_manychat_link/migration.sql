-- AlterEnum
ALTER TYPE "LeadNoteKind" ADD VALUE 'PAYMENT_CONFIRMED';

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "nextDueDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "manychatIgUsername" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "manychatPageId" TEXT,
ADD COLUMN     "siteWebhookSecret" TEXT;

-- CreateTable
CREATE TABLE "PaymentRecord" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(10,2) NOT NULL,
    "method" "PaymentMethod",
    "confirmedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PaymentRecord_tenantId_paidAt_idx" ON "PaymentRecord"("tenantId", "paidAt");

-- CreateIndex
CREATE INDEX "PaymentRecord_enrollmentId_idx" ON "PaymentRecord"("enrollmentId");

-- CreateIndex
CREATE INDEX "Enrollment_tenantId_status_nextDueDate_idx" ON "Enrollment"("tenantId", "status", "nextDueDate");

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRecord" ADD CONSTRAINT "PaymentRecord_confirmedById_fkey" FOREIGN KEY ("confirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────────────────
-- Backfills / limpeza de dados (v1.1-AB)
-- ──────────────────────────────────────────────────────────────────────────

-- 1) Vencimento inicial: dia do mês de `enrolledAt`, no ciclo corrente se
-- ainda não passou, senão no próximo. LEAST() clampa dia 29-31 pro último
-- dia de meses mais curtos. Só matrículas com cobrança em andamento.
UPDATE "Enrollment"
SET "nextDueDate" =
  CASE
    WHEN date_trunc('month', CURRENT_DATE)
         + (LEAST(
              EXTRACT(DAY FROM "enrolledAt"),
              EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'))
            ) - 1) * INTERVAL '1 day' >= CURRENT_DATE
    THEN date_trunc('month', CURRENT_DATE)
         + (LEAST(
              EXTRACT(DAY FROM "enrolledAt"),
              EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'))
            ) - 1) * INTERVAL '1 day'
    ELSE date_trunc('month', CURRENT_DATE + INTERVAL '1 month')
         + (LEAST(
              EXTRACT(DAY FROM "enrolledAt"),
              EXTRACT(DAY FROM (date_trunc('month', CURRENT_DATE + INTERVAL '1 month') + INTERVAL '1 month' - INTERVAL '1 day'))
            ) - 1) * INTERVAL '1 day'
  END
WHERE "status" IN ('ACTIVE', 'SUSPENDED') AND "nextDueDate" IS NULL;

-- 2) Limpeza de placeholders do ManyChat que chegaram literais ("{{phone}}",
-- "{{email}}", "Fulana {{last_name}}") quando o campo estava vazio no flow.
UPDATE "Lead" SET "phone" = NULL WHERE "phone" LIKE '%{{%';
UPDATE "Lead" SET "email" = NULL WHERE "email" LIKE '%{{%';
UPDATE "Lead"
SET "name" = COALESCE(NULLIF(trim(regexp_replace("name", '\{\{[^}]*\}\}', '', 'g')), ''), 'Contato ManyChat')
WHERE "name" LIKE '%{{%';

-- 3) Backfill do ig_username a partir dos webhooks já recebidos (payload
-- mais recente de cada subscriber vence).
UPDATE "Lead" l
SET "manychatIgUsername" = src.ig
FROM (
  SELECT DISTINCT ON (w."tenantId", w.payload->'subscriber'->>'id')
    w."tenantId" AS tenant_id,
    w.payload->'subscriber'->>'id' AS subscriber_id,
    w.payload->'subscriber'->>'ig_username' AS ig
  FROM "WebhookLog" w
  WHERE w.source = 'manychat'
    AND COALESCE(w.payload->'subscriber'->>'ig_username', '') <> ''
    AND w.payload->'subscriber'->>'ig_username' NOT LIKE '%{{%'
  ORDER BY w."tenantId", w.payload->'subscriber'->>'id', w."createdAt" DESC
) src
WHERE l."tenantId" = src.tenant_id
  AND l."manychatSubscriberId" = src.subscriber_id
  AND l."manychatIgUsername" IS NULL;

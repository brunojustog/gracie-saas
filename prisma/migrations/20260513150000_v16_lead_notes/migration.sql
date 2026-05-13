-- Histórico de observações + eventos automáticos por lead (v1.1-L).

-- CreateEnum
CREATE TYPE "LeadNoteKind" AS ENUM (
  'MANUAL',
  'STAGE_CHANGED',
  'ENROLLMENT_CREATED',
  'ENROLLMENT_SUSPENDED',
  'ENROLLMENT_REACTIVATED',
  'ENROLLMENT_CANCELED',
  'CLASS_SCHEDULED',
  'CLASS_ATTENDED',
  'CLASS_NO_SHOW',
  'CLASS_RESCHEDULED',
  'CLASS_CANCELED',
  'WHATSAPP_REPLY',
  'FOLLOWUP_PAUSED',
  'FOLLOWUP_RESUMED',
  'LEAD_CREATED'
);

-- CreateTable
CREATE TABLE "LeadNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" "LeadNoteKind" NOT NULL,
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadNote_leadId_createdAt_idx" ON "LeadNote"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "LeadNote_tenantId_kind_idx" ON "LeadNote"("tenantId", "kind");

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadNote" ADD CONSTRAINT "LeadNote_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

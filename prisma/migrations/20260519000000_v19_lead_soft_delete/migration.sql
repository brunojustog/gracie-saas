-- v1.1-W: soft delete de leads + audit trail
ALTER TABLE "Lead" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "Lead" ADD COLUMN "deletedById" TEXT;
ALTER TABLE "Lead" ADD COLUMN "deletionReason" TEXT;

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_deletedById_fkey"
  FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Lead_tenantId_deletedAt_idx" ON "Lead"("tenantId", "deletedAt");

-- Novos kinds pro diário do lead
ALTER TYPE "LeadNoteKind" ADD VALUE 'LEAD_DELETED' AFTER 'LEAD_CREATED';
ALTER TYPE "LeadNoteKind" ADD VALUE 'LEAD_RESTORED' AFTER 'LEAD_DELETED';

-- CreateEnum
CREATE TYPE "FollowUpStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "followUpEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "wuzapiToken" TEXT,
ADD COLUMN     "wuzapiUrl" TEXT;

-- CreateTable
CREATE TABLE "FollowUpJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "sequenceStep" INTEGER NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "FollowUpStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "renderedBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FollowUpJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FollowUpJob_tenantId_status_scheduledAt_idx" ON "FollowUpJob"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "FollowUpJob_leadId_idx" ON "FollowUpJob"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "FollowUpJob_leadId_sequenceStep_key" ON "FollowUpJob"("leadId", "sequenceStep");

-- AddForeignKey
ALTER TABLE "FollowUpJob" ADD CONSTRAINT "FollowUpJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpJob" ADD CONSTRAINT "FollowUpJob_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

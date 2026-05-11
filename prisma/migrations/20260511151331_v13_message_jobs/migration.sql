/*
  Warnings:

  - You are about to drop the `FollowUpJob` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "MessageJobStatus" AS ENUM ('PENDING', 'SENT', 'SKIPPED', 'FAILED');

-- DropForeignKey
ALTER TABLE "FollowUpJob" DROP CONSTRAINT "FollowUpJob_leadId_fkey";

-- DropForeignKey
ALTER TABLE "FollowUpJob" DROP CONSTRAINT "FollowUpJob_tenantId_fkey";

-- DropTable
DROP TABLE "FollowUpJob";

-- DropEnum
DROP TYPE "FollowUpStatus";

-- CreateTable
CREATE TABLE "MessageJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "experimentalClassId" TEXT,
    "templateKey" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "MessageJobStatus" NOT NULL DEFAULT 'PENDING',
    "sentAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "renderedBody" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessageJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessageJob_tenantId_status_scheduledAt_idx" ON "MessageJob"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "MessageJob_leadId_idx" ON "MessageJob"("leadId");

-- CreateIndex
CREATE INDEX "MessageJob_experimentalClassId_idx" ON "MessageJob"("experimentalClassId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageJob_leadId_templateKey_experimentalClassId_key" ON "MessageJob"("leadId", "templateKey", "experimentalClassId");

-- AddForeignKey
ALTER TABLE "MessageJob" ADD CONSTRAINT "MessageJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageJob" ADD CONSTRAINT "MessageJob_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageJob" ADD CONSTRAINT "MessageJob_experimentalClassId_fkey" FOREIGN KEY ("experimentalClassId") REFERENCES "ExperimentalClass"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "PrivatePackageStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'CANCELED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadNoteKind" ADD VALUE 'PRIVATE_PACKAGE_CREATED';
ALTER TYPE "LeadNoteKind" ADD VALUE 'PRIVATE_PACKAGE_COMPLETED';
ALTER TYPE "LeadNoteKind" ADD VALUE 'PRIVATE_PACKAGE_CANCELED';

-- CreateTable
CREATE TABLE "PrivatePackage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "modalityId" TEXT,
    "totalClasses" INTEGER NOT NULL,
    "value" DECIMAL(10,2) NOT NULL,
    "paymentMethod" "PaymentMethod",
    "status" "PrivatePackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "soldById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivatePackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrivateSession" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "scheduledDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrivateSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PrivatePackage_tenantId_status_idx" ON "PrivatePackage"("tenantId", "status");

-- CreateIndex
CREATE INDEX "PrivatePackage_leadId_idx" ON "PrivatePackage"("leadId");

-- CreateIndex
CREATE INDEX "PrivateSession_packageId_idx" ON "PrivateSession"("packageId");

-- AddForeignKey
ALTER TABLE "PrivatePackage" ADD CONSTRAINT "PrivatePackage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivatePackage" ADD CONSTRAINT "PrivatePackage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivatePackage" ADD CONSTRAINT "PrivatePackage_modalityId_fkey" FOREIGN KEY ("modalityId") REFERENCES "Modality"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivatePackage" ADD CONSTRAINT "PrivatePackage_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrivateSession" ADD CONSTRAINT "PrivateSession_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PrivatePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

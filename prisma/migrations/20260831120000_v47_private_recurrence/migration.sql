-- v1.2-AF: recorrência das aulas particulares (data de pagamento + aulas por ciclo).

ALTER TYPE "LeadNoteKind" ADD VALUE IF NOT EXISTS 'PRIVATE_PACKAGE_RENEWED';

ALTER TABLE "PrivatePackage" ADD COLUMN "recurring" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PrivatePackage" ADD COLUMN "recurringDay" INTEGER;
ALTER TABLE "PrivatePackage" ADD COLUMN "recurringClasses" INTEGER;

CREATE TABLE "PrivatePackageRenewal" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "paidAt" DATE NOT NULL,
    "classesAdded" INTEGER NOT NULL,
    "value" DECIMAL(10,2),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PrivatePackageRenewal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PrivatePackageRenewal_packageId_paidAt_idx" ON "PrivatePackageRenewal"("packageId", "paidAt");

ALTER TABLE "PrivatePackageRenewal" ADD CONSTRAINT "PrivatePackageRenewal_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PrivatePackage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

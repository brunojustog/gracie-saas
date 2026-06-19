-- AlterEnum
ALTER TYPE "EnrollmentStatus" ADD VALUE 'JUDICIAL';

-- AlterTable
ALTER TABLE "Enrollment" ADD COLUMN     "contractEndAt" TIMESTAMP(3),
ADD COLUMN     "frozenDaysUsed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "frozenKind" TEXT;

-- ──────────────────────────────────────────────────────────────────────────
-- Redesign do congelado (v1.1-AT): SUSPENDED não é mais usado. Os registros
-- legados (congelados misturados com perdas/erros) voltam a ACTIVE — decisão
-- do Bruno na reunião ("reativar todos esses → 153 ativos"). A equipe
-- reclassifica os perdidos como JUDICIAL e re-congela os realmente afastados.
-- ──────────────────────────────────────────────────────────────────────────
UPDATE "Enrollment"
SET status = 'ACTIVE',
    "suspendedAt" = NULL,
    "suspensionReason" = NULL,
    "expectedReturnAt" = NULL
WHERE status = 'SUSPENDED';

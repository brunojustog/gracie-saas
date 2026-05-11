-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "LeadOrigin" ADD VALUE 'MANYCHAT';
ALTER TYPE "LeadOrigin" ADD VALUE 'LINK_BIO';
ALTER TYPE "LeadOrigin" ADD VALUE 'PHONE_CALL';
ALTER TYPE "LeadOrigin" ADD VALUE 'HOSPITAL_PARTNERSHIP';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

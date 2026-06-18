-- AlterEnum
ALTER TYPE "LeadNoteKind" ADD VALUE 'COLLECTION_NOTE';

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "belt" TEXT,
ADD COLUMN     "beltDegree" INTEGER;

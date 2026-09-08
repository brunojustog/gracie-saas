-- v1.2-AS: horário fim + tatame/local na grade + foto do professor.
ALTER TABLE "ClassGridSlot" ADD COLUMN "endTime" TEXT;
ALTER TABLE "ClassGridSlot" ADD COLUMN "local" TEXT;
ALTER TABLE "Professor" ADD COLUMN "photoData" BYTEA;
ALTER TABLE "Professor" ADD COLUMN "photoMime" TEXT;

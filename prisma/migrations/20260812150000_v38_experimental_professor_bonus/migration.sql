-- v1.1-CH: professor na experimental + hora-aula do professor (bonificação).

ALTER TABLE "ExperimentalClass" ADD COLUMN "professorId" TEXT;
CREATE INDEX "ExperimentalClass_professorId_idx" ON "ExperimentalClass"("professorId");
ALTER TABLE "ExperimentalClass"
  ADD CONSTRAINT "ExperimentalClass_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Professor" ADD COLUMN "hourlyRate" DECIMAL(10,2) NOT NULL DEFAULT 70;

-- v56: agendamento de provas de graduacao (horarios fixos, 1 prova por slot).
CREATE TYPE "GraduationExamStatus" AS ENUM ('SCHEDULED', 'DONE', 'CANCELED', 'NO_SHOW');

CREATE TABLE "GraduationExam" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "durationMin" INTEGER NOT NULL DEFAULT 60,
    "targetBelt" TEXT,
    "targetBeltDegree" INTEGER,
    "professorId" TEXT,
    "status" "GraduationExamStatus" NOT NULL DEFAULT 'SCHEDULED',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GraduationExam_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GraduationExam_tenantId_scheduledAt_key" ON "GraduationExam"("tenantId", "scheduledAt");
CREATE INDEX "GraduationExam_tenantId_scheduledAt_idx" ON "GraduationExam"("tenantId", "scheduledAt");
CREATE INDEX "GraduationExam_alunoId_idx" ON "GraduationExam"("alunoId");

ALTER TABLE "GraduationExam" ADD CONSTRAINT "GraduationExam_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GraduationExam" ADD CONSTRAINT "GraduationExam_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GraduationExam" ADD CONSTRAINT "GraduationExam_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

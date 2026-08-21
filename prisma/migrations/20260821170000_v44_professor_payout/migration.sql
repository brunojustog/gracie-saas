-- v1.2-P: fechamento mensal (congelado) do professor.
CREATE TABLE "ProfessorPayout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "regularValor" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "auxValor" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "particularValor" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "convValor" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "paidAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfessorPayout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProfessorPayout_professorId_competencia_key" ON "ProfessorPayout"("professorId", "competencia");
CREATE INDEX "ProfessorPayout_tenantId_competencia_idx" ON "ProfessorPayout"("tenantId", "competencia");
ALTER TABLE "ProfessorPayout" ADD CONSTRAINT "ProfessorPayout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessorPayout" ADD CONSTRAINT "ProfessorPayout_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

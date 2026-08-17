-- v1.1-CJ: nota fiscal do professor (PDF) anexada no login dele.
CREATE TABLE "ProfessorInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "competencia" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProfessorInvoice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProfessorInvoice_tenantId_competencia_idx" ON "ProfessorInvoice"("tenantId", "competencia");
CREATE INDEX "ProfessorInvoice_professorId_competencia_idx" ON "ProfessorInvoice"("professorId", "competencia");

ALTER TABLE "ProfessorInvoice" ADD CONSTRAINT "ProfessorInvoice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProfessorInvoice" ADD CONSTRAINT "ProfessorInvoice_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

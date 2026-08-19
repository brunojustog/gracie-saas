-- v1.2-C (Etapa 2): graduação do aluno (linha do tempo + foto).
CREATE TABLE "Graduation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "belt" TEXT NOT NULL,
    "beltDegree" INTEGER NOT NULL DEFAULT 0,
    "graduatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "professorId" TEXT,
    "photoData" BYTEA,
    "photoMime" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Graduation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Graduation_tenantId_alunoId_idx" ON "Graduation"("tenantId", "alunoId");
CREATE INDEX "Graduation_alunoId_graduatedAt_idx" ON "Graduation"("alunoId", "graduatedAt");

ALTER TABLE "Graduation" ADD CONSTRAINT "Graduation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Graduation" ADD CONSTRAINT "Graduation_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Graduation" ADD CONSTRAINT "Graduation_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

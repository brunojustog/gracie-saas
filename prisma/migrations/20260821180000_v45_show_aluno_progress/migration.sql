-- v1.2-S: toggle da barra de progresso do aluno (gestão pode esconder).
ALTER TABLE "Tenant" ADD COLUMN "showAlunoProgress" BOOLEAN NOT NULL DEFAULT true;

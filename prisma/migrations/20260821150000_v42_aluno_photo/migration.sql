-- v1.2-I: foto de perfil do aluno (avatar).
ALTER TABLE "Aluno" ADD COLUMN "photoData" BYTEA;
ALTER TABLE "Aluno" ADD COLUMN "photoMime" TEXT;

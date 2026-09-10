-- v53: tamanhos de kimono e faixa na ficha do aluno (logistica de graduacao).
ALTER TABLE "Aluno" ADD COLUMN IF NOT EXISTS "kimonoSize" TEXT;
ALTER TABLE "Aluno" ADD COLUMN IF NOT EXISTS "beltSize" TEXT;

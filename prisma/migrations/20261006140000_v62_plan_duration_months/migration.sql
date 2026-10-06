-- v62 (E): duracao do plano em meses (p/ calcular o termino do contrato).
ALTER TABLE "Plan" ADD COLUMN IF NOT EXISTS "durationMonths" INTEGER;

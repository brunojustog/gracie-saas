-- v57: responsavel pelo pagamento (nome no extrato). Ex.: crianca paga pelo pai.
ALTER TABLE "Lead" ADD COLUMN IF NOT EXISTS "payerName" TEXT;

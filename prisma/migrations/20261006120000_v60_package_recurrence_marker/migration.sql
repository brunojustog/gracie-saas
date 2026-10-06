-- v60: marca do ultimo ciclo gerado automaticamente (idempotencia da recorrencia).
ALTER TABLE "PrivatePackage" ADD COLUMN IF NOT EXISTS "lastRecurrenceAt" TIMESTAMP(3);

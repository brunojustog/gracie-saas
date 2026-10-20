-- v68 (CG): valor + venda do pagamento de graduação (adultos) + pagamento kids.
ALTER TABLE "GraduationExam" ADD COLUMN IF NOT EXISTS "amount" DECIMAL(10,2);
ALTER TABLE "GraduationExam" ADD COLUMN IF NOT EXISTS "saleId" TEXT;

CREATE TABLE IF NOT EXISTS "GraduationKidPayment" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "alunoId"       TEXT NOT NULL,
  "amount"        DECIMAL(10,2) NOT NULL,
  "paymentMethod" "PaymentMethod",
  "paidAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notes"         TEXT,
  "saleId"        TEXT,
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GraduationKidPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GraduationKidPayment_tenantId_paidAt_idx" ON "GraduationKidPayment" ("tenantId", "paidAt");
CREATE INDEX IF NOT EXISTS "GraduationKidPayment_alunoId_idx" ON "GraduationKidPayment" ("alunoId");

DO $$ BEGIN
  ALTER TABLE "GraduationKidPayment" ADD CONSTRAINT "GraduationKidPayment_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "GraduationKidPayment" ADD CONSTRAINT "GraduationKidPayment_alunoId_fkey"
    FOREIGN KEY ("alunoId") REFERENCES "Aluno" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

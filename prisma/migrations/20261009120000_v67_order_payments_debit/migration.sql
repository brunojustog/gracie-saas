-- v67 (CC): encomendas vinculadas ao aluno + pagamento (total/parcial) como venda
-- da lojinha (caixa/histórico) + combinado do restante.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "customerLeadId" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentPlan" TEXT;
ALTER TABLE "Sale"  ADD COLUMN IF NOT EXISTS "orderId" TEXT;

CREATE INDEX IF NOT EXISTS "Order_customerLeadId_idx" ON "Order" ("customerLeadId");
CREATE INDEX IF NOT EXISTS "Sale_orderId_idx" ON "Sale" ("orderId");

DO $$ BEGIN
  ALTER TABLE "Order" ADD CONSTRAINT "Order_customerLeadId_fkey"
    FOREIGN KEY ("customerLeadId") REFERENCES "Lead" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Sale" ADD CONSTRAINT "Sale_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

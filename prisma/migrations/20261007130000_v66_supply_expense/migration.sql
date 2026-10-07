-- v66 (F6): compras de insumos da academia (despesa, sem estoque).
CREATE TABLE IF NOT EXISTS "SupplyExpense" (
  "id"          TEXT NOT NULL,
  "tenantId"    TEXT NOT NULL,
  "item"        TEXT NOT NULL,
  "category"    TEXT,
  "quantity"    INTEGER,
  "amount"      DECIMAL(10,2) NOT NULL,
  "supplier"    TEXT,
  "notes"       TEXT,
  "purchasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplyExpense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupplyExpense_tenantId_purchasedAt_idx" ON "SupplyExpense" ("tenantId", "purchasedAt");

DO $$ BEGIN
  ALTER TABLE "SupplyExpense" ADD CONSTRAINT "SupplyExpense_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

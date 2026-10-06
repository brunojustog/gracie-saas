-- v64 (D): compras da academia pro estoque da lojinha (custo + margem).
CREATE TABLE IF NOT EXISTS "Purchase" (
  "id"            TEXT NOT NULL,
  "tenantId"      TEXT NOT NULL,
  "variantId"     TEXT,
  "productName"   TEXT NOT NULL,
  "variantLabel"  TEXT,
  "quantity"      INTEGER NOT NULL,
  "unitCost"      DECIMAL(10,2) NOT NULL,
  "unitSalePrice" DECIMAL(10,2),
  "supplier"      TEXT,
  "notes"         TEXT,
  "purchasedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "Purchase_tenantId_purchasedAt_idx" ON "Purchase" ("tenantId", "purchasedAt");

DO $$ BEGIN
  ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_variantId_fkey"
    FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

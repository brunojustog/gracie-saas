-- v1.2-CJ: encomenda vinculada a uma variante do estoque + flag de baixa feita.
ALTER TABLE "Order" ADD COLUMN "variantId" TEXT;
ALTER TABLE "Order" ADD COLUMN "stockTaken" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "Order_variantId_idx" ON "Order"("variantId");

ALTER TABLE "Order" ADD CONSTRAINT "Order_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "ProductVariant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

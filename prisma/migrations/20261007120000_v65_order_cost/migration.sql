-- v65 (C4): custo da encomenda (p/ lucro por venda).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "cost" DECIMAL(10,2);

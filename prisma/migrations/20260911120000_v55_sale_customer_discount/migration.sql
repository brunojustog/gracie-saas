-- v55: snapshot do nome do cliente na venda + desconto (5% no PIX).
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "customerName" TEXT;
ALTER TABLE "Sale" ADD COLUMN IF NOT EXISTS "discount" DECIMAL(10,2) NOT NULL DEFAULT 0;

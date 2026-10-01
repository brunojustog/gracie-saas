-- v58: campos extras na encomenda (planilha Pedidos_de_venda).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "matricula" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "progress" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "pickupAt" TIMESTAMP(3);

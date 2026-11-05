-- v1.2-CK: entrada no estoque ao "Chegou" + saída ao "Entregue". Troca o
-- booleano stockTaken por um inteiro com a quantidade aplicada ao estoque.
ALTER TABLE "Order" DROP COLUMN IF EXISTS "stockTaken";
ALTER TABLE "Order" ADD COLUMN "stockApplied" INTEGER NOT NULL DEFAULT 0;

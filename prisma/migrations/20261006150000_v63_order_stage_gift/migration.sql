-- v63 (C): etapa do processo de venda das encomendas (Kanban) + encomenda de brinde.
DO $$ BEGIN
  CREATE TYPE "OrderStage" AS ENUM ('REQUESTED', 'ORDERED', 'ARRIVED', 'DELIVERED', 'EXCHANGE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "stage" "OrderStage" NOT NULL DEFAULT 'REQUESTED';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "isGift" BOOLEAN NOT NULL DEFAULT false;

-- Encomendas já entregues começam como DELIVERED (não reabrir como "pedido feito").
UPDATE "Order" SET "stage" = 'DELIVERED' WHERE "status" = 'FULFILLED';

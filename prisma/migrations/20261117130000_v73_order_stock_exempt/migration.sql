-- v1.3-C: encomenda — baixa de estoque na ENTREGA (−qtd) + trava anti-falha.
-- Novo campo "item avulso" (entrega sem baixa, escolha consciente).
ALTER TABLE "Order" ADD COLUMN "stockExempt" BOOLEAN NOT NULL DEFAULT false;

-- Grandfather: encomendas antigas sem produto viram "avulso" explícito
-- (não travam na entrega). Só as NOVAS passam pelo fluxo rígido.
UPDATE "Order" SET "stockExempt" = true WHERE "variantId" IS NULL;

-- Normaliza encomendas mid-flight do modelo antigo (entrada aplicada no "Chegou"):
-- zera o aplicado nas não-entregues pra não baixar em dobro ao entregar no modelo
-- novo. NÃO mexe no saldo do estoque (só a contabilidade da encomenda).
UPDATE "Order" SET "stockApplied" = 0 WHERE "stage" <> 'DELIVERED' AND "stockApplied" <> 0;

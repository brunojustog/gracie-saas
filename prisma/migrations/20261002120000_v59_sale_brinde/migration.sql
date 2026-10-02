-- v59: forma de venda "Brinde" (kimono da matrícula anual) — baixa estoque, R$ 0.
ALTER TYPE "SalePaymentMethod" ADD VALUE IF NOT EXISTS 'BRINDE' AFTER 'CORTESIA';

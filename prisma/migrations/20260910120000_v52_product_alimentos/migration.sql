-- v52: nova categoria de produto "ALIMENTOS" (separa barrinha/hit nuts etc. dos
-- suplementos). Pedido da Ana via Anderson (reuniao 10/09).
ALTER TYPE "ProductCategory" ADD VALUE IF NOT EXISTS 'ALIMENTOS' AFTER 'SUPLEMENTO';

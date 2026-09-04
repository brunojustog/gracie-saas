-- v1.2-AM: foto do produto (bytes no Postgres) + upload com limite de tamanho.
ALTER TABLE "Product" ADD COLUMN "imageData" BYTEA;
ALTER TABLE "Product" ADD COLUMN "imageMime" TEXT;

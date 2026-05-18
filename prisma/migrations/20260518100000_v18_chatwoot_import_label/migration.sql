-- v1.1-U: filtro de import por label do Chatwoot.
-- Null/empty = importa tudo (comportamento legado, backward compatible).
ALTER TABLE "Tenant" ADD COLUMN "chatwootImportLabel" TEXT;

-- v1.3-B: trava de baixa de mensalidade por usuário.
-- Nova coluna (default false = ninguém baixa até receber acesso explícito).
ALTER TABLE "TenantUser" ADD COLUMN "canSettleTuition" BOOLEAN NOT NULL DEFAULT false;

-- Backfill inicial (GBAF): libera só os usuários definidos pelo Bruno. Daqui em
-- diante o acesso é gerenciado em Config → Usuários (toggle por pessoa).
UPDATE "TenantUser"
SET "canSettleTuition" = true
WHERE "userId" IN (
  SELECT "id" FROM "User"
  WHERE lower("email") IN (
    'bruno@simplificaonline.site',
    'melliz.br@outlook.com',
    'antoniojunior@villemor.com.br'
  )
);

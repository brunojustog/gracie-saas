-- v1.1-BF: token do link público (read-only) do Quadro do Vitor.
ALTER TABLE "Tenant" ADD COLUMN "publicQuadroToken" TEXT;
CREATE UNIQUE INDEX "Tenant_publicQuadroToken_key" ON "Tenant"("publicQuadroToken");

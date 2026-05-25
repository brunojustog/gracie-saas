-- v1.1-AA: integração ManyChat (webhook-in).
-- Tenant: secret pra validar webhook (header X-Manychat-Secret).
ALTER TABLE "Tenant" ADD COLUMN "manychatWebhookSecret" TEXT;

-- Lead: subscriber ID do ManyChat pra dedup quando o mesmo subscriber
-- dispara vários eventos (created → tag → resposta → conversa).
ALTER TABLE "Lead" ADD COLUMN "manychatSubscriberId" TEXT;

CREATE INDEX "Lead_manychatSubscriberId_idx" ON "Lead"("manychatSubscriberId");

-- Novo kind pro diário do lead (tag aplicada, flow respondido, etc.)
ALTER TYPE "LeadNoteKind" ADD VALUE 'MANYCHAT_EVENT' AFTER 'LEAD_RESTORED';

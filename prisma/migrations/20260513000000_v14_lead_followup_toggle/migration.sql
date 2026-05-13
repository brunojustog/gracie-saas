-- Toggle de follow-up automático por lead (v1.1-J).
-- Default true pra preservar comportamento: leads existentes continuam
-- elegíveis pra cadência. Quem quiser pausar manualmente desliga pela UI.

ALTER TABLE "Lead"
ADD COLUMN "followUpEnabled" BOOLEAN NOT NULL DEFAULT true;

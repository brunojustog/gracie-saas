-- v1.2-AI: marca o professor gestor (dono) — recebimento à parte, fora do
-- total a repassar dos professores.
ALTER TABLE "Professor" ADD COLUMN "isOwner" BOOLEAN NOT NULL DEFAULT false;

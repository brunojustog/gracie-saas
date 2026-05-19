-- v1.1-X: marcador de estágio "auto-abre modal de agendar aula" no drag do kanban
ALTER TABLE "Stage" ADD COLUMN "isScheduling" BOOLEAN NOT NULL DEFAULT false;

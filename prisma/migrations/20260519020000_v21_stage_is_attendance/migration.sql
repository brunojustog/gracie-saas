-- v1.1-Y: marcador de estágio "marca aula como ATTENDED" no drag do kanban
ALTER TABLE "Stage" ADD COLUMN "isAttendance" BOOLEAN NOT NULL DEFAULT false;

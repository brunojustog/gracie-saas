-- v1.2-U: eventos da linha do tempo do aluno (com fotos em galeria).
CREATE TYPE "TimelineEventKind" AS ENUM ('GRADUACAO', 'GRAU', 'CAMPEONATO', 'INICIO', 'OUTRO');

CREATE TABLE "TimelineEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "kind" "TimelineEventKind" NOT NULL DEFAULT 'OUTRO',
    "title" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimelineEvent_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TimelineEvent_alunoId_eventDate_idx" ON "TimelineEvent"("alunoId", "eventDate");
CREATE INDEX "TimelineEvent_tenantId_idx" ON "TimelineEvent"("tenantId");

CREATE TABLE "TimelineEventPhoto" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime" TEXT NOT NULL,
    CONSTRAINT "TimelineEventPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "TimelineEventPhoto_eventId_idx" ON "TimelineEventPhoto"("eventId");

ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimelineEvent" ADD CONSTRAINT "TimelineEvent_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimelineEventPhoto" ADD CONSTRAINT "TimelineEventPhoto_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "TimelineEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

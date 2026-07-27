-- v1.1-BZ: professores + vínculo com aulas particulares.
CREATE TABLE "Professor" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Professor_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Professor_tenantId_active_idx" ON "Professor"("tenantId", "active");

ALTER TABLE "Professor"
  ADD CONSTRAINT "Professor_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PrivateSession" ADD COLUMN "professorId" TEXT;

CREATE INDEX "PrivateSession_professorId_idx" ON "PrivateSession"("professorId");

ALTER TABLE "PrivateSession"
  ADD CONSTRAINT "PrivateSession_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

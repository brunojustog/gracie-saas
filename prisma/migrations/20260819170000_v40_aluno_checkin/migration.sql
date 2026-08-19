-- v1.2-A: Aluno + ciclo de presença (check-in). Base da gestão completa.

-- Novo perfil de acesso (não usado nesta migration → seguro no mesmo tx).
ALTER TYPE "Role" ADD VALUE 'ALUNO';

-- Origem do check-in.
CREATE TYPE "CheckInSource" AS ENUM ('ALUNO', 'PROFESSOR');

-- Tenant: coordenadas da academia + raio do geofence do check-in.
ALTER TABLE "Tenant" ADD COLUMN "latitude" DECIMAL(10,7);
ALTER TABLE "Tenant" ADD COLUMN "longitude" DECIMAL(10,7);
ALTER TABLE "Tenant" ADD COLUMN "checkinRadiusMeters" INTEGER NOT NULL DEFAULT 6000;

-- Aluno (1:1 com Lead).
CREATE TABLE "Aluno" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "userId" TEXT,
    "matricula" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastGraduationAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Aluno_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Aluno_leadId_key" ON "Aluno"("leadId");
CREATE UNIQUE INDEX "Aluno_userId_key" ON "Aluno"("userId");
CREATE INDEX "Aluno_tenantId_active_idx" ON "Aluno"("tenantId", "active");
CREATE INDEX "Aluno_tenantId_matricula_idx" ON "Aluno"("tenantId", "matricula");

-- Sessão de aula (ocorrência do dia, gerada da grade).
CREATE TABLE "ClassSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gridSlotId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isKids" BOOLEAN NOT NULL DEFAULT false,
    "professorId" TEXT,
    "checkinLimit" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ClassSession_gridSlotId_date_key" ON "ClassSession"("gridSlotId", "date");
CREATE INDEX "ClassSession_tenantId_date_idx" ON "ClassSession"("tenantId", "date");

-- Check-in (presença do aluno numa sessão).
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "alunoId" TEXT NOT NULL,
    "source" "CheckInSource" NOT NULL DEFAULT 'ALUNO',
    "present" BOOLEAN NOT NULL DEFAULT false,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "distanceM" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CheckIn_sessionId_alunoId_key" ON "CheckIn"("sessionId", "alunoId");
CREATE INDEX "CheckIn_tenantId_createdAt_idx" ON "CheckIn"("tenantId", "createdAt");
CREATE INDEX "CheckIn_alunoId_idx" ON "CheckIn"("alunoId");

-- Foreign keys.
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Aluno" ADD CONSTRAINT "Aluno_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_gridSlotId_fkey" FOREIGN KEY ("gridSlotId") REFERENCES "ClassGridSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_professorId_fkey" FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_alunoId_fkey" FOREIGN KEY ("alunoId") REFERENCES "Aluno"("id") ON DELETE CASCADE ON UPDATE CASCADE;

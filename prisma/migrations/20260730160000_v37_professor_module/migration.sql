-- v1.1-CB: módulo de controle de aulas dos professores.

-- 1) Novo papel PROFESSOR.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'PROFESSOR';

-- 2) Professor ganha link opcional pro login (convite por e-mail).
ALTER TABLE "Professor" ADD COLUMN "userId" TEXT;
ALTER TABLE "Professor" ADD COLUMN "email" TEXT;
CREATE UNIQUE INDEX "Professor_userId_key" ON "Professor"("userId");
ALTER TABLE "Professor"
  ADD CONSTRAINT "Professor_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 3) Grade padrão recorrente.
CREATE TABLE "ClassGridSlot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "startTime" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isKids" BOOLEAN NOT NULL DEFAULT false,
    "value" DECIMAL(10,2) NOT NULL DEFAULT 70,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassGridSlot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ClassGridSlot_tenantId_dayOfWeek_idx" ON "ClassGridSlot"("tenantId", "dayOfWeek");
CREATE INDEX "ClassGridSlot_professorId_idx" ON "ClassGridSlot"("professorId");
ALTER TABLE "ClassGridSlot" ADD CONSTRAINT "ClassGridSlot_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClassGridSlot" ADD CONSTRAINT "ClassGridSlot_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) Aula regular/kids efetivamente dada (check do professor).
CREATE TYPE "TaughtClassStatus" AS ENUM ('PENDING', 'CONFIRMED');

CREATE TABLE "TaughtClass" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "professorId" TEXT NOT NULL,
    "titularProfessorId" TEXT,
    "auxProfessorId" TEXT,
    "gridSlotId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isKids" BOOLEAN NOT NULL DEFAULT false,
    "value" DECIMAL(10,2) NOT NULL,
    "status" "TaughtClassStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TaughtClass_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TaughtClass_gridSlotId_date_key" ON "TaughtClass"("gridSlotId", "date");
CREATE INDEX "TaughtClass_tenantId_date_idx" ON "TaughtClass"("tenantId", "date");
CREATE INDEX "TaughtClass_professorId_date_idx" ON "TaughtClass"("professorId", "date");
CREATE INDEX "TaughtClass_auxProfessorId_date_idx" ON "TaughtClass"("auxProfessorId", "date");
ALTER TABLE "TaughtClass" ADD CONSTRAINT "TaughtClass_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaughtClass" ADD CONSTRAINT "TaughtClass_professorId_fkey"
  FOREIGN KEY ("professorId") REFERENCES "Professor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TaughtClass" ADD CONSTRAINT "TaughtClass_auxProfessorId_fkey"
  FOREIGN KEY ("auxProfessorId") REFERENCES "Professor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TaughtClass" ADD CONSTRAINT "TaughtClass_gridSlotId_fkey"
  FOREIGN KEY ("gridSlotId") REFERENCES "ClassGridSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

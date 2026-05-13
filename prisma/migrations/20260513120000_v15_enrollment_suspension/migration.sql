-- Congelar matrícula (v1.1-K): metadados da última suspensão. Todos os
-- campos são opcionais — só populados quando a matrícula entra em SUSPENDED.

ALTER TABLE "Enrollment"
ADD COLUMN "suspendedAt"      TIMESTAMP(3),
ADD COLUMN "suspensionReason" TEXT,
ADD COLUMN "expectedReturnAt" TIMESTAMP(3);

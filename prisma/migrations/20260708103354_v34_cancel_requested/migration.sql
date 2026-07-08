-- v1.1-BN: status "Solicitou cancelamento" + data da solicitação.
ALTER TYPE "EnrollmentStatus" ADD VALUE IF NOT EXISTS 'CANCEL_REQUESTED' BEFORE 'CANCELED';
ALTER TABLE "Enrollment" ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);

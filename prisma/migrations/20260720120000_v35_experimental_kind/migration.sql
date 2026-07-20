-- v1.1-BT: experimental em 2 etapas (1ª individual com o professor, 2ª em turma).
CREATE TYPE "ExperimentalClassKind" AS ENUM ('INDIVIDUAL', 'GROUP');

ALTER TABLE "ExperimentalClass"
  ADD COLUMN "kind" "ExperimentalClassKind" NOT NULL DEFAULT 'INDIVIDUAL';

-- Histórico: antes desta mudança TODA experimental era em turma. Marca o
-- passado como GROUP pra não poluir a segmentação 1ª×2ª com dado retroativo.
UPDATE "ExperimentalClass" SET "kind" = 'GROUP';

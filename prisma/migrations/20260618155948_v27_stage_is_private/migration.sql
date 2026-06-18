-- AlterTable
ALTER TABLE "Stage" ADD COLUMN     "isPrivate" BOOLEAN NOT NULL DEFAULT false;

-- ──────────────────────────────────────────────────────────────────────────
-- Cria o estágio terminal "Aula Particular" pra cada tenant que ainda não
-- tem um estágio isPrivate (idempotente). order = max+1; cor índigo.
-- ──────────────────────────────────────────────────────────────────────────
INSERT INTO "Stage" (id, "tenantId", name, color, "order", "isWon", "isLost", "isScheduling", "isAttendance", "isPrivate", active)
SELECT
  'stgpriv' || substr(md5(random()::text || t.id), 1, 18),
  t.id,
  'Aula Particular',
  '#6366F1',
  COALESCE((SELECT max(s."order") FROM "Stage" s WHERE s."tenantId" = t.id), 0) + 1,
  false, false, false, false, true, true
FROM "Tenant" t
WHERE NOT EXISTS (
  SELECT 1 FROM "Stage" s WHERE s."tenantId" = t.id AND s."isPrivate" = true
);

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('FEMALE', 'MALE');

-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "gender" "Gender";

-- AlterTable
ALTER TABLE "Modality" ADD COLUMN     "isKids" BOOLEAN NOT NULL DEFAULT false;

-- ──────────────────────────────────────────────────────────────────────────
-- Backfills (v1.1-AK — Quadro do Vitor)
-- ──────────────────────────────────────────────────────────────────────────

-- 1) Modalidades infantis: nome começando com "GBK" (Gracie Barra Kids) ou
-- contendo "Pequenos Campeões"/"Junior". ADMIN ajusta o resto na tela.
UPDATE "Modality"
SET "isKids" = true
WHERE name ILIKE 'GBK%'
   OR name ILIKE '%pequenos campe%'
   OR name ILIKE '%junior%';

-- 2) Gênero por palpite do PRIMEIRO nome (pt-BR). Regra: termina em "a" =>
-- feminino (salvo exceções masculinas), + lista de nomes femininos que não
-- terminam em "a". O resto vira masculino. É só um chute pra ADMIN revisar
-- na ficha do lead — não é verdade absoluta.
WITH fn AS (
  SELECT id, lower(split_part(btrim(name), ' ', 1)) AS first_name
  FROM "Lead"
)
UPDATE "Lead" l
SET "gender" = CASE
  WHEN fn.first_name = '' THEN NULL
  WHEN fn.first_name IN (
    'raquel','isabel','beatriz','ines','inês','karen','ester','esther','rute','ruth',
    'eliane','cristiane','adriane','daniele','danielle','michele','michelle',
    'eveline','evelyn','heloise','heloíse','elizabeth','jaqueline','jacqueline',
    'caroline','isabelle','gabrielle','emanuelle','marianne','luane','luanne','nicole','mariane'
  ) THEN 'FEMALE'::"Gender"
  WHEN fn.first_name LIKE '%a'
       AND fn.first_name NOT IN ('luca','josua','joshua','elia','aja') THEN 'FEMALE'::"Gender"
  ELSE 'MALE'::"Gender"
END
FROM fn
WHERE l.id = fn.id;

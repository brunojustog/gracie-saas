"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { runCsvImport, type ImportCsvSummary } from "@/server/import-csv";
import { requireRole } from "@/server/tenant";

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB por CSV — folga grande pros casos da Gracie

type ImportResult =
  | { ok: true; summary: ImportCsvSummary }
  | { ok: false; error: string };

/**
 * Recebe os 2 CSVs via FormData (campos `aulas` e `matriculas`) + flag `apply`.
 * Roda o importador no contexto do tenant da membership atual.
 */
export async function runImportFromUpload(formData: FormData): Promise<ImportResult> {
  const { tenant } = await requireRole("ADMIN");

  const aulasFile = formData.get("aulas");
  const matriculasFile = formData.get("matriculas");
  const apply = formData.get("apply") === "true";

  if (!(aulasFile instanceof File) || aulasFile.size === 0) {
    return { ok: false, error: "Arquivo 'aulas-experimentais.csv' não foi enviado" };
  }
  if (!(matriculasFile instanceof File) || matriculasFile.size === 0) {
    return { ok: false, error: "Arquivo 'matriculas.csv' não foi enviado" };
  }
  if (aulasFile.size > MAX_BYTES) {
    return { ok: false, error: `Arquivo de aulas grande demais (>${MAX_BYTES / 1024 / 1024} MB)` };
  }
  if (matriculasFile.size > MAX_BYTES) {
    return { ok: false, error: `Arquivo de matrículas grande demais (>${MAX_BYTES / 1024 / 1024} MB)` };
  }

  const [aulasBuf, matriculasBuf] = await Promise.all([
    aulasFile.arrayBuffer().then((ab) => Buffer.from(ab)),
    matriculasFile.arrayBuffer().then((ab) => Buffer.from(ab)),
  ]);

  try {
    const summary = await runCsvImport(prisma, {
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      aulasCsv: aulasBuf,
      matriculasCsv: matriculasBuf,
      apply,
    });
    if (apply) revalidatePath("/kanban");
    return { ok: true, summary };
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return { ok: false, error: message };
  }
}

/**
 * CLI wrapper do importador de CSV. A lógica real mora em
 * `src/server/import-csv.ts` (compartilhada com a UI /settings/import-csv).
 *
 * Uso:
 *   tsx scripts/import-csv.ts                       # dry-run (default)
 *   tsx scripts/import-csv.ts --apply               # persiste no banco
 *   tsx scripts/import-csv.ts --tenant bgaf --apply
 *   tsx scripts/import-csv.ts --dir /outro/path     # CSVs em outro diretório
 *
 * Espera 2 arquivos em `<dir>/aulas-experimentais.csv` e `<dir>/matriculas.csv`.
 */
import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { runCsvImport, type ImportCsvSummary } from "../src/server/import-csv";

function pickFlag(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1) return def;
  return process.argv[i + 1];
}

const TENANT_SLUG = pickFlag("--tenant", "gracie")!;
const APPLY = process.argv.includes("--apply");
const CSV_DIR = pickFlag("--dir", join(process.cwd(), "data", "import-csv"))!;
const AE_PATH = join(CSV_DIR, "aulas-experimentais.csv");
const MAT_PATH = join(CSV_DIR, "matriculas.csv");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function printSummary(s: ImportCsvSummary): void {
  console.log(`\n📋 Import CSV — tenant=${TENANT_SLUG}  modo=${s.mode}\n`);
  console.log(`  Linhas AE:        ${s.aeLines}`);
  console.log(`  Linhas Matrículas: ${s.matriculasLines}\n`);
  console.log(`  Vendedoras únicas (${s.vendedoras.length}): ${s.vendedoras.join(", ")}\n`);
  console.log(`  Planos únicos (${s.planos.length}): ${s.planos.join(" | ")}\n`);
  console.log(`  Leads consolidados (após AE): ${s.leadsConsolidated}`);
  console.log(`  Leads totais (AE + matr órfãs): ${s.leadsTotal}`);
  console.log(`  Enrollments a criar:            ${s.enrollmentsPlanned}\n`);
  console.log(`  Distribuição por stage:`);
  for (const d of s.stageDistribution) {
    const flag = d.exists ? "✓" : "✗ STAGE INEXISTENTE";
    console.log(`    ${d.stage.padEnd(20)} ${String(d.count).padStart(4)}  ${flag}`);
  }
  console.log();
  console.log(`  Modalidades referenciadas:`);
  for (const d of s.modalityUsage) {
    const flag = d.exists ? "✓" : "✗ MODALITY INEXISTENTE";
    console.log(`    ${d.modality.padEnd(35)} ${String(d.count).padStart(4)}  ${flag}`);
  }
  console.log();

  if (s.applied) {
    console.log(`  ✅ Leads criados:     ${s.applied.leadsCreated}`);
    console.log(`  ✅ Leads atualizados: ${s.applied.leadsUpdated}`);
    console.log(`  ✅ Matrículas:        ${s.applied.enrollmentsCreated} (puladas: ${s.applied.enrollmentsSkipped})`);
    if (s.applied.leadsSkipped > 0) {
      console.log(`  ⚠️  Leads pulados (stage inexistente): ${s.applied.leadsSkipped}`);
    }
  } else {
    console.log("⚠️  DRY-RUN — nada foi escrito no banco.");
    console.log("    Rode com --apply pra persistir.");
  }
  if (s.warnings.length > 0) {
    console.log("\n  Avisos:");
    for (const w of s.warnings) console.log(`    - ${w}`);
  }
}

async function main() {
  if (!existsSync(AE_PATH)) {
    console.error(`❌ Arquivo não encontrado: ${AE_PATH}`);
    process.exit(1);
  }
  if (!existsSync(MAT_PATH)) {
    console.error(`❌ Arquivo não encontrado: ${MAT_PATH}`);
    process.exit(1);
  }

  const tenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
  if (!tenant) throw new Error(`Tenant não encontrado: ${TENANT_SLUG}`);

  const summary = await runCsvImport(prisma, {
    tenantId: tenant.id,
    tenantSlug: tenant.slug,
    aulasCsv: readFileSync(AE_PATH),
    matriculasCsv: readFileSync(MAT_PATH),
    apply: APPLY,
  });

  printSummary(summary);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

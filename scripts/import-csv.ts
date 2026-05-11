/**
 * Importa as 2 planilhas-mãe da Gracie Barra Anália Franco:
 *   - data/import-csv/aulas-experimentais.csv  (~200 linhas, leads que fizeram AE)
 *   - data/import-csv/matriculas.csv           (~150 linhas, alunos que fecharam)
 *
 * Estratégia:
 *   1. Resolve vendedoras (Responsavel / Responsavel da Venda) → cria placeholder
 *      User+TenantUser com email `{slug}@{tenant}.local`, sem senha (login bloqueado).
 *      Bruno pode invitar de verdade depois pelo /settings/team — o email troca.
 *   2. Lê AE → consolida por (nome, telefone). Mesma pessoa que veio 3x = 1 lead com
 *      tags acumuladas + lastInteractionAt = última AE.
 *   3. Lê Matrículas → tenta match com AE existente por (nome, telefone) e depois
 *      por nome puro (matriculadas sem AE prévia ficam com tag "Sem AE").
 *   4. Mapeia Status concatenado ("Agendado, Confirmado, Compareceu, Matriculado")
 *      → stage final + tags acumulativas. Veja parseStatus() pra prioridade.
 *   5. Programa (GB1/GB2/GBK/GBF/BF) → Modality direta. GBK fica em
 *      "GBK - Pequenos Campeões 1" com tag "GBK-revisar" pra triagem manual.
 *
 * Encoding: a planilha exportada do Google Sheets vem em latin-1 (mesmo quando
 * a extensão é .csv). Detecto via heurística e converto pra UTF-8 in-memory.
 *
 * Idempotente: rodar 2x não duplica. Match é por (tenantId, name, phone).
 *
 * Uso:
 *   tsx scripts/import-csv.ts                    # dry-run (default)
 *   tsx scripts/import-csv.ts --apply            # persiste no banco
 *   tsx scripts/import-csv.ts --tenant bgaf --apply
 *   tsx scripts/import-csv.ts --dir /outro/path  # CSVs em outro diretório
 */
import "dotenv/config";

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  PaymentMethod,
  Role,
  type LeadOrigin,
} from "@prisma/client";
import { parse } from "csv-parse/sync";

// ──────────────────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────────────────

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

// ──────────────────────────────────────────────────────────────────────────
// Helpers genéricos
// ──────────────────────────────────────────────────────────────────────────

/**
 * Conserta mojibake típico de "latin-1 bytes interpretados como UTF-8 e
 * reencodados". Ex: "ObservaÃ§Ã£o" → "Observação".
 */
function fixMojibake(s: string): string {
  if (!s) return s;
  // Heurística rápida: se não tem padrão típico, retorna como está.
  if (!/Ã[\x80-\xBF]|Â[\x80-\xBF]/.test(s)) return s;
  try {
    return Buffer.from(s, "latin1").toString("utf8");
  } catch {
    return s;
  }
}

/** Normaliza fone pra dígitos. Remove DDI 55 quando presente. */
function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return digits;
}

function parseDate(s: string | undefined | null): Date | null {
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim());
  if (!m) return null;
  const [, d, mo, y] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function combineDateTime(date: Date | null, timeStr: string | undefined | null): Date | null {
  if (!date) return null;
  if (!timeStr) return date;
  const cleaned = timeStr.replace(/\s/g, "");
  const m = /^(\d{1,2})[:h](\d{1,2})$/i.exec(cleaned);
  if (!m) return date;
  const [, h, mi] = m;
  const combined = new Date(date);
  combined.setHours(Number(h), Number(mi), 0, 0);
  return combined;
}

/** "R$ 499,90" → 499.90 */
function parseValue(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const cleaned = String(raw).replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isNaN(n) ? null : n;
}

// ──────────────────────────────────────────────────────────────────────────
// Mappers de domínio
// ──────────────────────────────────────────────────────────────────────────

const ORIGIN_MAP: Record<string, LeadOrigin> = {
  "rua": "WALK_IN",
  "indicação": "REFERRAL",
  "indicacao": "REFERRAL",
  "telefonema": "PHONE_CALL",
  "ligação": "PHONE_CALL",
  "ligacao": "PHONE_CALL",
  "manychat": "MANYCHAT",
  "link da bio": "LINK_BIO",
  "hospital": "HOSPITAL_PARTNERSHIP",
  "insta organico": "INSTAGRAM_DIRECT",
  "campanha whatsapp": "WHATSAPP",
};

function mapOrigin(s: string | undefined | null): LeadOrigin {
  if (!s) return "OTHER";
  const fixed = fixMojibake(s).trim().toLowerCase();
  return ORIGIN_MAP[fixed] ?? "OTHER";
}

const PAYMENT_MAP: Record<string, PaymentMethod> = {
  "cartão crédito": PaymentMethod.CREDIT_CARD,
  "cielo (online)": PaymentMethod.CREDIT_CARD,
  "crédito maquininha": PaymentMethod.CREDIT_CARD,
  "cartão crédito (link)": PaymentMethod.CREDIT_CARD,
  "pix": PaymentMethod.PIX,
};

function mapPayment(s: string | undefined | null): PaymentMethod {
  if (!s) return PaymentMethod.OTHER;
  const fixed = fixMojibake(s).trim().toLowerCase();
  return PAYMENT_MAP[fixed] ?? PaymentMethod.OTHER;
}

/**
 * Status concatenado → stage + tags. Stage segue prioridade do mais "final"
 * (Matriculado) pro mais "inicial" (Contatado).
 */
function parseStatus(statusRaw: string | undefined | null): {
  stageName: string;
  tags: string[];
} {
  const fixed = fixMojibake(statusRaw ?? "");
  const tokens = new Set(
    fixed.split(",").map((s) => s.trim()).filter(Boolean),
  );

  const tags = new Set<string>();
  if (tokens.has("Contatado")) tags.add("Contatado");
  if (tokens.has("Confirmado")) tags.add("Confirmado");
  if (tokens.has("Remarcou")) tags.add("Remarcou");
  if (tokens.has("VISITANTE GB")) tags.add("VISITANTE GB");
  if (tokens.has("AVULSO")) tags.add("AVULSO");

  let stageName = "Novo Lead";
  if (tokens.has("Matriculado")) {
    stageName = "Ganho";
  } else if (tokens.has("Aluno Perdido")) {
    stageName = "Perda";
    tags.add("Aluno Perdido");
  } else if (tokens.has("Não fechou")) {
    stageName = "Perda";
    tags.add("Não Fechou");
  } else if (tokens.has("Compareceu")) {
    stageName = "Comparecimento";
  } else if (tokens.has("Não compareceu")) {
    stageName = "Agendamento";
    tags.add("Não compareceu");
  } else if (
    tokens.has("Confirmado") ||
    tokens.has("Agendado") ||
    tokens.has("Remarcou")
  ) {
    stageName = "Agendamento";
  }

  return { stageName, tags: [...tags] };
}

/** Programa CSV ("GB1", "GBK", "BF" …) → Modality name + tag opcional. */
function mapProgram(programRaw: string | undefined | null): {
  modalityName: string | null;
  extraTag?: string;
} {
  if (!programRaw) return { modalityName: null };
  const fixed = fixMojibake(programRaw).trim().toUpperCase();
  // Múltiplos: "GB1, GBK" — pega o primeiro
  const first = fixed.split(/[,;/]/)[0]?.trim() ?? "";

  switch (first) {
    case "GB1":
      return { modalityName: "GB1" };
    case "GB2":
      return { modalityName: "GB2" };
    case "GBA":
    case "GB3":
      return { modalityName: "GBA" };
    case "GBF":
      return { modalityName: "GBF" };
    case "BF":
      return { modalityName: "BarraFit" };
    case "GBK":
      return { modalityName: "GBK - Pequenos Campeões 1", extraTag: "GBK-revisar" };
    default:
      return { modalityName: null };
  }
}

/** "Anna" → "anna@gracie.local" */
function vendedoraToEmail(name: string, tenantSlug: string): string {
  const slug = fixMojibake(name)
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
  return `${slug}@${tenantSlug}.local`;
}

const dedupKey = (name: string, phone: string | null) =>
  `${fixMojibake(name).trim().toLowerCase()}|${phone ?? ""}`;

// ──────────────────────────────────────────────────────────────────────────
// CSV reader (com mojibake fix + dedup de header)
// ──────────────────────────────────────────────────────────────────────────

function decodeAuto(buffer: Buffer): string {
  // Caractere replacement (�) indica byte stream não é UTF-8 válido →
  // arquivo é latin-1 puro. Caso contrário, retornamos UTF-8 (que pode ter
  // mojibake interno — corrigido depois em cada campo por fixMojibake).
  const utf8 = buffer.toString("utf8");
  if (utf8.includes("�")) return buffer.toString("latin1");
  return utf8;
}

function parseCsv(buffer: Buffer): Record<string, string>[] {
  const text = decodeAuto(buffer);
  return parse(text, {
    columns: (header: string[]) => {
      const seen = new Map<string, number>();
      return header.map((h) => {
        const fixed = fixMojibake(h ?? "").trim();
        const count = seen.get(fixed) ?? 0;
        seen.set(fixed, count + 1);
        return count === 0 ? fixed : `${fixed}_${count + 1}`;
      });
    },
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
    bom: true,
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Tipos de trabalho
// ──────────────────────────────────────────────────────────────────────────

type ConsolidatedLead = {
  name: string;
  phone: string | null;
  origin: LeadOrigin;
  modalityName: string | null;
  stageName: string;
  tags: Set<string>;
  notes: string;
  sellerName: string | null;
  firstInteractionAt: Date;
  lastInteractionAt: Date;
  /** ExperimentalClass records — pra criar via prisma depois (futuro). */
  aeRecords: Array<{
    scheduledAt: Date;
    modalityName: string | null;
    statusRaw: string;
  }>;
};

type EnrollmentDraft = {
  leadKey: string;
  planName: string;
  modalityName: string | null;
  monthlyValue: number;
  paymentMethod: PaymentMethod;
  enrolledAt: Date;
  observations: string;
};

// ──────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────

async function main() {
  console.log(
    `\n📋 Import CSV — tenant=${TENANT_SLUG}  modo=${APPLY ? "APPLY" : "DRY-RUN"}\n`,
  );

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

  const stages = await prisma.stage.findMany({ where: { tenantId: tenant.id } });
  const stageByName = new Map(stages.map((s) => [s.name, s]));
  const modalities = await prisma.modality.findMany({ where: { tenantId: tenant.id } });
  const modalityByName = new Map(modalities.map((m) => [m.name, m]));

  console.log(`  Stages: ${stages.map((s) => s.name).join(", ")}`);
  console.log(`  Modalities: ${modalities.map((m) => m.name).join(", ")}\n`);

  const aeRows = parseCsv(readFileSync(AE_PATH));
  const matRows = parseCsv(readFileSync(MAT_PATH));
  console.log(`  Linhas AE:        ${aeRows.length}`);
  console.log(`  Linhas Matrículas: ${matRows.length}\n`);

  // ── Vendedoras ──
  const vendedoras = new Set<string>();
  for (const row of aeRows) {
    const v = fixMojibake(row["Responsavel"] ?? "").trim();
    if (v) v.split(",").forEach((x) => { const t = x.trim(); if (t) vendedoras.add(t); });
  }
  for (const row of matRows) {
    const v = fixMojibake(row["Responsavel da Venda"] ?? "").trim();
    if (v) vendedoras.add(v);
  }
  console.log(`  Vendedoras únicas (${vendedoras.size}): ${[...vendedoras].join(", ")}\n`);

  const vendedoraToUserId = new Map<string, string>();
  if (APPLY) {
    for (const name of vendedoras) {
      const email = vendedoraToEmail(name, TENANT_SLUG);
      const user = await prisma.user.upsert({
        where: { email },
        create: { email, name },
        update: { name },
      });
      await prisma.tenantUser.upsert({
        where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
        create: { tenantId: tenant.id, userId: user.id, role: Role.SELLER },
        update: {},
      });
      vendedoraToUserId.set(name, user.id);
    }
  } else {
    for (const name of vendedoras) {
      vendedoraToUserId.set(name, `[dry:${vendedoraToEmail(name, TENANT_SLUG)}]`);
    }
  }

  // ── Planos ──
  const planSamples = new Map<string, { value: number }>();
  for (const row of matRows) {
    const name = fixMojibake(row["Plano"] ?? "").trim();
    if (!name) continue;
    if (!planSamples.has(name)) {
      const value = parseValue(row["Valor "] ?? row["Valor"]) ?? 499.9;
      planSamples.set(name, { value });
    }
  }
  console.log(`  Planos únicos (${planSamples.size}): ${[...planSamples.keys()].join(" | ")}\n`);

  const planToInfo = new Map<string, { id: string; monthlyValue: number }>();
  if (APPLY) {
    for (const [name, sample] of planSamples) {
      const existing = await prisma.plan.findFirst({
        where: { tenantId: tenant.id, name },
      });
      if (existing) {
        planToInfo.set(name, {
          id: existing.id,
          monthlyValue: Number(existing.monthlyValue),
        });
      } else {
        const plan = await prisma.plan.create({
          data: { tenantId: tenant.id, name, monthlyValue: sample.value },
        });
        planToInfo.set(name, { id: plan.id, monthlyValue: sample.value });
      }
    }
  } else {
    for (const [name, sample] of planSamples) {
      planToInfo.set(name, { id: `[dry:${name}]`, monthlyValue: sample.value });
    }
  }

  // ── Consolida AE → leads ──
  const consolidated = new Map<string, ConsolidatedLead>();

  for (const row of aeRows) {
    const name = fixMojibake(row["Nome completo"] ?? "").trim();
    if (!name) continue;

    const phone = normalizePhone(row["Contato"]);
    const key = dedupKey(name, phone);

    const dataCriacao = parseDate(row["Coluna 1"]);
    const dataAula = parseDate(row["Dia"]);
    const horaAula = row["Dia_2"];
    const aulaAt = combineDateTime(dataAula, horaAula) ?? dataAula ?? dataCriacao ?? new Date();
    const firstSeen = dataCriacao ?? aulaAt;

    const origin = mapOrigin(row["Origem"]);
    const program = mapProgram(row["Programa"]);
    const { stageName, tags } = parseStatus(row["Status"]);
    const notes = fixMojibake(row["Observação"] ?? "").trim();
    const sellerRaw = fixMojibake(row["Responsavel"] ?? "").trim();
    const seller = sellerRaw.split(",")[0]?.trim() || null;

    const existing = consolidated.get(key);
    if (existing) {
      tags.forEach((t) => existing.tags.add(t));
      if (program.extraTag) existing.tags.add(program.extraTag);
      if (aulaAt > existing.lastInteractionAt) {
        existing.lastInteractionAt = aulaAt;
        existing.stageName = stageName;
        if (program.modalityName) existing.modalityName = program.modalityName;
        if (origin !== "OTHER") existing.origin = origin;
        if (seller) existing.sellerName = seller;
      }
      if (firstSeen < existing.firstInteractionAt) {
        existing.firstInteractionAt = firstSeen;
      }
      if (notes && !existing.notes.includes(notes)) {
        existing.notes = existing.notes
          ? `${existing.notes}\n---\n${notes}`
          : notes;
      }
      existing.aeRecords.push({
        scheduledAt: aulaAt,
        modalityName: program.modalityName,
        statusRaw: row["Status"] ?? "",
      });
    } else {
      const tagSet = new Set(tags);
      if (program.extraTag) tagSet.add(program.extraTag);
      consolidated.set(key, {
        name,
        phone,
        origin,
        modalityName: program.modalityName,
        stageName,
        tags: tagSet,
        notes,
        sellerName: seller,
        firstInteractionAt: firstSeen,
        lastInteractionAt: aulaAt,
        aeRecords: [{
          scheduledAt: aulaAt,
          modalityName: program.modalityName,
          statusRaw: row["Status"] ?? "",
        }],
      });
    }
  }
  console.log(`  Leads consolidados (após AE): ${consolidated.size}`);

  // ── Matrículas → enrollments + cria leads órfãs ──
  const enrollmentDrafts: EnrollmentDraft[] = [];

  for (const row of matRows) {
    const name = fixMojibake(row["Nome completo"] ?? "").trim();
    if (!name) continue;

    const phone = normalizePhone(row["Contato"]);
    const dataPag = parseDate(row["Data de Pagamento"]) ?? new Date();
    const program = mapProgram(row["Programa"]);
    const planName = fixMojibake(row["Plano"] ?? "").trim() || "Plano Fundadores";
    const value = parseValue(row["Valor "] ?? row["Valor"]) ?? 499.9;
    const paymentMethod = mapPayment(row["Método de pagamento"]);
    const observations = fixMojibake(row["Observação"] ?? "").trim();
    const sellerRaw = fixMojibake(row["Responsavel da Venda"] ?? "").trim();
    const seller = sellerRaw || null;
    const key = dedupKey(name, phone);

    // Match: primeiro tenta (name+phone), depois só por nome (matricula geralmente
    // não tem phone na planilha)
    let lead = consolidated.get(key);
    if (!lead) {
      const nameLower = name.toLowerCase();
      for (const v of consolidated.values()) {
        if (v.name.toLowerCase() === nameLower) {
          lead = v;
          break;
        }
      }
    }

    if (lead) {
      lead.stageName = "Ganho";
      if (dataPag > lead.lastInteractionAt) lead.lastInteractionAt = dataPag;
      if (program.modalityName) lead.modalityName = program.modalityName;
      if (program.extraTag) lead.tags.add(program.extraTag);
      if (observations) {
        const tagged = `[Matrícula] ${observations}`;
        lead.notes = lead.notes ? `${lead.notes}\n---\n${tagged}` : tagged;
      }
      if (seller && !lead.sellerName) lead.sellerName = seller;
      enrollmentDrafts.push({
        leadKey: dedupKey(lead.name, lead.phone),
        planName,
        modalityName: program.modalityName,
        monthlyValue: value,
        paymentMethod,
        enrolledAt: dataPag,
        observations,
      });
    } else {
      const tagSet = new Set<string>(["Sem AE"]);
      if (program.extraTag) tagSet.add(program.extraTag);
      consolidated.set(key, {
        name,
        phone,
        origin: "OTHER",
        modalityName: program.modalityName,
        stageName: "Ganho",
        tags: tagSet,
        notes: observations ? `[Matrícula direta] ${observations}` : "[Matrícula direta]",
        sellerName: seller,
        firstInteractionAt: dataPag,
        lastInteractionAt: dataPag,
        aeRecords: [],
      });
      enrollmentDrafts.push({
        leadKey: key,
        planName,
        modalityName: program.modalityName,
        monthlyValue: value,
        paymentMethod,
        enrolledAt: dataPag,
        observations,
      });
    }
  }

  console.log(`  Leads totais (AE + matr órfãs): ${consolidated.size}`);
  console.log(`  Enrollments a criar:            ${enrollmentDrafts.length}\n`);

  // ── Sanidade: distribuição por stage ──
  const byStage = new Map<string, number>();
  for (const l of consolidated.values()) {
    byStage.set(l.stageName, (byStage.get(l.stageName) ?? 0) + 1);
  }
  console.log(`  Distribuição por stage:`);
  for (const [stage, count] of byStage) {
    const status = stageByName.has(stage) ? "✓" : "✗ STAGE INEXISTENTE";
    console.log(`    ${stage.padEnd(20)} ${String(count).padStart(4)}  ${status}`);
  }
  console.log();

  // ── Sanidade: modalidades referenciadas ──
  const modUsage = new Map<string, number>();
  for (const l of consolidated.values()) {
    if (l.modalityName) {
      modUsage.set(l.modalityName, (modUsage.get(l.modalityName) ?? 0) + 1);
    }
  }
  console.log(`  Modalidades referenciadas:`);
  for (const [mod, count] of modUsage) {
    const status = modalityByName.has(mod) ? "✓" : "✗ MODALITY INEXISTENTE";
    console.log(`    ${mod.padEnd(35)} ${String(count).padStart(4)}  ${status}`);
  }
  console.log();

  if (!APPLY) {
    console.log("⚠️  DRY-RUN — nada foi escrito no banco.");
    console.log("    Rode com --apply pra persistir.\n");
    return;
  }

  // ── Persistência ──
  console.log(`💾 Persistindo...\n`);
  let leadsCreated = 0;
  let leadsUpdated = 0;

  for (const lead of consolidated.values()) {
    const stage = stageByName.get(lead.stageName);
    if (!stage) {
      console.warn(`  ⚠️ Stage não encontrado: ${lead.stageName} — pulando ${lead.name}`);
      continue;
    }
    const modality = lead.modalityName ? modalityByName.get(lead.modalityName) : null;
    const sellerId = lead.sellerName ? vendedoraToUserId.get(lead.sellerName) : null;

    const existing = await prisma.lead.findFirst({
      where: { tenantId: tenant.id, name: lead.name, phone: lead.phone },
    });

    const data = {
      origin: lead.origin,
      stageId: stage.id,
      modalityId: modality?.id ?? null,
      assignedSellerId: sellerId ?? null,
      tags: [...lead.tags],
      notes: lead.notes || null,
      firstInteractionAt: lead.firstInteractionAt,
      lastInteractionAt: lead.lastInteractionAt,
    };

    if (existing) {
      await prisma.lead.update({ where: { id: existing.id }, data });
      leadsUpdated++;
    } else {
      await prisma.lead.create({
        data: {
          tenantId: tenant.id,
          name: lead.name,
          phone: lead.phone,
          ...data,
        },
      });
      leadsCreated++;
    }
  }

  let enrollmentsCreated = 0;
  let enrollmentsSkipped = 0;
  for (const enr of enrollmentDrafts) {
    const lead = consolidated.get(enr.leadKey);
    if (!lead) {
      enrollmentsSkipped++;
      continue;
    }
    const dbLead = await prisma.lead.findFirst({
      where: { tenantId: tenant.id, name: lead.name, phone: lead.phone },
    });
    if (!dbLead) {
      enrollmentsSkipped++;
      continue;
    }
    const existing = await prisma.enrollment.findUnique({ where: { leadId: dbLead.id } });
    if (existing) {
      enrollmentsSkipped++;
      continue;
    }
    const plan = planToInfo.get(enr.planName);
    if (!plan) {
      enrollmentsSkipped++;
      continue;
    }
    // Fallback de modalidade quando matrícula não tem programa: usa GB1.
    const modality = enr.modalityName
      ? modalityByName.get(enr.modalityName)
      : modalityByName.get("GB1");
    if (!modality) {
      enrollmentsSkipped++;
      continue;
    }

    await prisma.enrollment.create({
      data: {
        tenantId: tenant.id,
        leadId: dbLead.id,
        modalityId: modality.id,
        planId: plan.id,
        monthlyValue: enr.monthlyValue,
        paymentMethod: enr.paymentMethod,
        enrolledAt: enr.enrolledAt,
        observations: enr.observations || null,
      },
    });
    enrollmentsCreated++;
  }

  console.log(`  ✅ Leads criados:     ${leadsCreated}`);
  console.log(`  ✅ Leads atualizados: ${leadsUpdated}`);
  console.log(`  ✅ Matrículas:        ${enrollmentsCreated} (puladas: ${enrollmentsSkipped})`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });

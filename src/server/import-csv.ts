/**
 * Importador de planilhas de Aulas Experimentais + Matrículas, extraído do
 * `scripts/import-csv.ts` pra ser reutilizável pela UI admin (/settings/import-csv).
 *
 * Recebe os 2 CSVs como Buffer + tenantId + flag apply. Retorna um summary
 * estruturado em vez de printar no stdout (que era o que o CLI fazia).
 *
 * Comportamento idêntico ao script CLI — veja docstring lá pra estratégia
 * completa (consolidação por nome+telefone, vendedoras placeholder, etc).
 */
import {
  PaymentMethod,
  Role,
  type LeadOrigin,
  type PrismaClient,
} from "@prisma/client";
import { parse } from "csv-parse/sync";

// ──────────────────────────────────────────────────────────────────────────
// Helpers genéricos
// ──────────────────────────────────────────────────────────────────────────

export function fixMojibake(s: string): string {
  if (!s) return s;
  if (!/Ã[\x80-\xBF]|Â[\x80-\xBF]/.test(s)) return s;
  try {
    return Buffer.from(s, "latin1").toString("utf8");
  } catch {
    return s;
  }
}

export function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return digits;
}

function parseDateBr(s: string | undefined | null): Date | null {
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
  rua: "WALK_IN",
  "indicação": "REFERRAL",
  indicacao: "REFERRAL",
  telefonema: "PHONE_CALL",
  "ligação": "PHONE_CALL",
  ligacao: "PHONE_CALL",
  manychat: "MANYCHAT",
  "link da bio": "LINK_BIO",
  hospital: "HOSPITAL_PARTNERSHIP",
  "insta organico": "INSTAGRAM_DIRECT",
  "campanha whatsapp": "WHATSAPP",
};

function mapOrigin(s: string | undefined | null): LeadOrigin {
  if (!s) return "OTHER";
  return ORIGIN_MAP[fixMojibake(s).trim().toLowerCase()] ?? "OTHER";
}

const PAYMENT_MAP: Record<string, PaymentMethod> = {
  "cartão crédito": PaymentMethod.CREDIT_CARD,
  "cielo (online)": PaymentMethod.CREDIT_CARD,
  "crédito maquininha": PaymentMethod.CREDIT_CARD,
  "cartão crédito (link)": PaymentMethod.CREDIT_CARD,
  pix: PaymentMethod.PIX,
};

function mapPayment(s: string | undefined | null): PaymentMethod {
  if (!s) return PaymentMethod.OTHER;
  return PAYMENT_MAP[fixMojibake(s).trim().toLowerCase()] ?? PaymentMethod.OTHER;
}

function parseStatus(statusRaw: string | undefined | null): {
  stageName: string;
  tags: string[];
} {
  const tokens = new Set(
    fixMojibake(statusRaw ?? "").split(",").map((s) => s.trim()).filter(Boolean),
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

function mapProgram(programRaw: string | undefined | null): {
  modalityName: string | null;
  extraTag?: string;
} {
  if (!programRaw) return { modalityName: null };
  const first = fixMojibake(programRaw).trim().toUpperCase().split(/[,;/]/)[0]?.trim() ?? "";
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
// CSV reader
// ──────────────────────────────────────────────────────────────────────────

function decodeAuto(buffer: Buffer): string {
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
// Tipos internos
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
// API pública
// ──────────────────────────────────────────────────────────────────────────

export type ImportCsvInput = {
  tenantId: string;
  tenantSlug: string;
  aulasCsv: Buffer;
  matriculasCsv: Buffer;
  apply: boolean;
};

export type ImportCsvSummary = {
  mode: "DRY_RUN" | "APPLY";
  aeLines: number;
  matriculasLines: number;
  vendedoras: string[];
  planos: string[];
  leadsConsolidated: number;
  leadsTotal: number;
  enrollmentsPlanned: number;
  stageDistribution: Array<{ stage: string; count: number; exists: boolean }>;
  modalityUsage: Array<{ modality: string; count: number; exists: boolean }>;
  /** Presente apenas quando apply=true. */
  applied?: {
    leadsCreated: number;
    leadsUpdated: number;
    enrollmentsCreated: number;
    enrollmentsSkipped: number;
    leadsSkipped: number;
  };
  /** Avisos / erros não-fatais. */
  warnings: string[];
};

export async function runCsvImport(
  prisma: PrismaClient,
  input: ImportCsvInput,
): Promise<ImportCsvSummary> {
  const warnings: string[] = [];

  const stages = await prisma.stage.findMany({ where: { tenantId: input.tenantId } });
  const stageByName = new Map(stages.map((s) => [s.name, s]));
  const modalities = await prisma.modality.findMany({ where: { tenantId: input.tenantId } });
  const modalityByName = new Map(modalities.map((m) => [m.name, m]));

  const aeRows = parseCsv(input.aulasCsv);
  const matRows = parseCsv(input.matriculasCsv);

  // ── Vendedoras ──
  const vendedoras = new Set<string>();
  for (const row of aeRows) {
    const v = fixMojibake(row["Responsavel"] ?? "").trim();
    if (v) v.split(",").forEach((x) => {
      const t = x.trim();
      if (t) vendedoras.add(t);
    });
  }
  for (const row of matRows) {
    const v = fixMojibake(row["Responsavel da Venda"] ?? "").trim();
    if (v) vendedoras.add(v);
  }

  const vendedoraToUserId = new Map<string, string>();
  if (input.apply) {
    for (const name of vendedoras) {
      const email = vendedoraToEmail(name, input.tenantSlug);
      const user = await prisma.user.upsert({
        where: { email },
        create: { email, name },
        update: { name },
      });
      await prisma.tenantUser.upsert({
        where: { tenantId_userId: { tenantId: input.tenantId, userId: user.id } },
        create: { tenantId: input.tenantId, userId: user.id, role: Role.SELLER },
        update: {},
      });
      vendedoraToUserId.set(name, user.id);
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

  const planToId = new Map<string, string>();
  if (input.apply) {
    for (const [name, sample] of planSamples) {
      const existing = await prisma.plan.findFirst({
        where: { tenantId: input.tenantId, name },
      });
      if (existing) {
        planToId.set(name, existing.id);
      } else {
        const plan = await prisma.plan.create({
          data: { tenantId: input.tenantId, name, monthlyValue: sample.value },
        });
        planToId.set(name, plan.id);
      }
    }
  }

  // ── Consolida AE → leads ──
  const consolidated = new Map<string, ConsolidatedLead>();

  for (const row of aeRows) {
    const name = fixMojibake(row["Nome completo"] ?? "").trim();
    if (!name) continue;

    const phone = normalizePhone(row["Contato"]);
    const key = dedupKey(name, phone);

    const dataCriacao = parseDateBr(row["Coluna 1"]);
    const dataAula = parseDateBr(row["Dia"]);
    const horaAula = row["Dia_2"];
    const aulaAt = combineDateTime(dataAula, horaAula) ?? dataAula ?? dataCriacao ?? new Date();
    const firstSeen = dataCriacao ?? aulaAt;

    const origin = mapOrigin(row["Origem"]);
    const program = mapProgram(row["Programa"]);
    const { stageName, tags } = parseStatus(row["Status"]);
    const notes = fixMojibake(row["Observação"] ?? "").trim();
    const seller = fixMojibake(row["Responsavel"] ?? "").trim().split(",")[0]?.trim() || null;

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
        existing.notes = existing.notes ? `${existing.notes}\n---\n${notes}` : notes;
      }
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
      });
    }
  }

  const leadsConsolidatedAfterAe = consolidated.size;

  // ── Matrículas → enrollments + cria leads órfãs ──
  const enrollmentDrafts: EnrollmentDraft[] = [];

  for (const row of matRows) {
    const name = fixMojibake(row["Nome completo"] ?? "").trim();
    if (!name) continue;

    const phone = normalizePhone(row["Contato"]);
    const dataPag = parseDateBr(row["Data de Pagamento"]) ?? new Date();
    const program = mapProgram(row["Programa"]);
    const planName = fixMojibake(row["Plano"] ?? "").trim() || "Plano Fundadores";
    const value = parseValue(row["Valor "] ?? row["Valor"]) ?? 499.9;
    const paymentMethod = mapPayment(row["Método de pagamento"]);
    const observations = fixMojibake(row["Observação"] ?? "").trim();
    const seller = fixMojibake(row["Responsavel da Venda"] ?? "").trim() || null;
    const key = dedupKey(name, phone);

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

  // ── Distribuição de stages e modalidades pro relatório ──
  const stageDistMap = new Map<string, number>();
  for (const l of consolidated.values()) {
    stageDistMap.set(l.stageName, (stageDistMap.get(l.stageName) ?? 0) + 1);
  }
  const stageDistribution = [...stageDistMap.entries()].map(([stage, count]) => ({
    stage,
    count,
    exists: stageByName.has(stage),
  }));

  const modUsageMap = new Map<string, number>();
  for (const l of consolidated.values()) {
    if (l.modalityName) modUsageMap.set(l.modalityName, (modUsageMap.get(l.modalityName) ?? 0) + 1);
  }
  const modalityUsage = [...modUsageMap.entries()].map(([modality, count]) => ({
    modality,
    count,
    exists: modalityByName.has(modality),
  }));

  // Avisa de stages/modalidades faltando
  for (const s of stageDistribution) {
    if (!s.exists) warnings.push(`Stage "${s.stage}" não existe no tenant (${s.count} leads afetados)`);
  }
  for (const m of modalityUsage) {
    if (!m.exists) warnings.push(`Modality "${m.modality}" não existe no tenant (${m.count} leads afetados)`);
  }

  const summary: ImportCsvSummary = {
    mode: input.apply ? "APPLY" : "DRY_RUN",
    aeLines: aeRows.length,
    matriculasLines: matRows.length,
    vendedoras: [...vendedoras],
    planos: [...planSamples.keys()],
    leadsConsolidated: leadsConsolidatedAfterAe,
    leadsTotal: consolidated.size,
    enrollmentsPlanned: enrollmentDrafts.length,
    stageDistribution,
    modalityUsage,
    warnings,
  };

  if (!input.apply) return summary;

  // ── Persistência ──
  let leadsCreated = 0;
  let leadsUpdated = 0;
  let leadsSkipped = 0;

  for (const lead of consolidated.values()) {
    const stage = stageByName.get(lead.stageName);
    if (!stage) {
      leadsSkipped++;
      continue;
    }
    const modality = lead.modalityName ? modalityByName.get(lead.modalityName) : null;
    const sellerId = lead.sellerName ? vendedoraToUserId.get(lead.sellerName) : null;

    const existing = await prisma.lead.findFirst({
      where: { tenantId: input.tenantId, name: lead.name, phone: lead.phone },
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
          tenantId: input.tenantId,
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
      where: { tenantId: input.tenantId, name: lead.name, phone: lead.phone },
    });
    if (!dbLead) {
      enrollmentsSkipped++;
      continue;
    }
    const existingEnr = await prisma.enrollment.findUnique({ where: { leadId: dbLead.id } });
    if (existingEnr) {
      enrollmentsSkipped++;
      continue;
    }
    const planId = planToId.get(enr.planName);
    if (!planId) {
      enrollmentsSkipped++;
      continue;
    }
    const modality = enr.modalityName
      ? modalityByName.get(enr.modalityName)
      : modalityByName.get("GB1");
    if (!modality) {
      enrollmentsSkipped++;
      continue;
    }

    await prisma.enrollment.create({
      data: {
        tenantId: input.tenantId,
        leadId: dbLead.id,
        modalityId: modality.id,
        planId,
        monthlyValue: enr.monthlyValue,
        paymentMethod: enr.paymentMethod,
        enrolledAt: enr.enrolledAt,
        observations: enr.observations || null,
      },
    });
    enrollmentsCreated++;
  }

  summary.applied = {
    leadsCreated,
    leadsUpdated,
    leadsSkipped,
    enrollmentsCreated,
    enrollmentsSkipped,
  };
  return summary;
}

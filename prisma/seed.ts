/**
 * Seed da fase 2: schema completo do domínio.
 *
 * Idempotente — pode ser rodado múltiplas vezes sem duplicar.
 * Cria:
 *   - Super-admin Bruno (global, isSuperAdmin)
 *   - Tenant "Gracie Barra Anália Franco" (slug: gracie)
 *   - Modalidades, planos, estágios do funil
 *   - Admin do tenant + 3 vendedoras
 *   - Vincula Bruno ao tenant como ADMIN também (conveniência dev)
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Em dev, default = "gracie" (URLs `gracie.localhost:3000`).
// Em prod, defina TENANT_SLUG=bgaf via env pra alinhar com `bgaf.simplificaonline.site`.
const TENANT_SLUG = process.env.TENANT_SLUG ?? "gracie";
const TENANT_NAME = process.env.TENANT_NAME ?? "Gracie Barra Anália Franco";

/**
 * Modalidades da grade da Gracie Barra Anália Franco.
 *
 * Histórico: o seed original tinha "GB3" como avançado. A grade real da
 * academia chama esta turma de "GBA" (em vermelho). Renomeei pra alinhar.
 * Caso algum lead/matrícula em prod aponte pra "GB3", a renomeação é
 * idempotente porque busca por `name` no upsertCatalog.
 *
 * Cores extraídas do quadro de horários (referência visual no calendário).
 */
const MODALITIES: Array<{
  name: string;
  ageRange?: string;
  description?: string;
  color: string;
  /** Nome anterior pra rebatizar se já existir. */
  previousName?: string;
}> = [
  { name: "GB1", ageRange: "16+", description: "Fundamentos / todos os níveis", color: "#3B82F6" },
  { name: "GB2", ageRange: "16+", description: "Intermediário", color: "#8B5CF6" },
  { name: "GBA", ageRange: "16+", description: "Avançado / Atletas", color: "#EF4444", previousName: "GB3" },
  { name: "GB NOGI", ageRange: "16+", description: "Submission / sem kimono", color: "#7C3AED" },
  { name: "BarraFit", description: "Funcional", color: "#6B7280" },
  { name: "GBF", description: "Feminino", color: "#EC4899" },
  { name: "GBK - Pequenos Campeões 1", ageRange: "4-7", color: "#FBBF24" },
  { name: "GBK - Pequenos Campeões 2", ageRange: "8-9", color: "#FBBF24" },
  { name: "GBK - Juniors", ageRange: "10-15", color: "#10B981" },
];

/**
 * Grade semanal fixa. dayOfWeek segue Date.getDay() (0=dom, 1=seg, ..., 6=sáb).
 * Compilada a partir do quadro oficial da academia (foto enviada pelo cliente
 * em 2026-05). Cada slot vira UMA entrada por modalidade — quando dois
 * retângulos compartilham horário (PC1+PC2, GBA+BarraFit, GB1+GB NOGI), são
 * 2 entradas paralelas.
 */
const SCHEDULE: Array<{ modality: string; day: number; time: string; durationMinutes?: number }> = [
  // Segunda
  { modality: "GB1", day: 1, time: "07:00" },
  { modality: "GBK - Pequenos Campeões 1", day: 1, time: "09:00" },
  { modality: "GBK - Pequenos Campeões 2", day: 1, time: "09:00" },
  { modality: "GB1", day: 1, time: "12:00" },
  { modality: "GBK - Pequenos Campeões 1", day: 1, time: "17:30" },
  { modality: "GBK - Pequenos Campeões 2", day: 1, time: "17:30" },
  { modality: "GBK - Juniors", day: 1, time: "18:30" },
  { modality: "GB1", day: 1, time: "19:30" },
  { modality: "GB NOGI", day: 1, time: "19:30" },
  { modality: "GB2", day: 1, time: "20:30" },

  // Terça
  { modality: "GB1", day: 2, time: "07:00" },
  { modality: "GBK - Pequenos Campeões 1", day: 2, time: "09:00" },
  { modality: "GBK - Pequenos Campeões 2", day: 2, time: "09:00" },
  { modality: "GB1", day: 2, time: "12:00" },
  { modality: "GBK - Juniors", day: 2, time: "17:30" },
  { modality: "GBA", day: 2, time: "17:30" },
  { modality: "BarraFit", day: 2, time: "17:30" },
  { modality: "GBK - Pequenos Campeões 1", day: 2, time: "18:30" },
  { modality: "GBK - Pequenos Campeões 2", day: 2, time: "18:30" },
  { modality: "GBA", day: 2, time: "18:30" },
  { modality: "BarraFit", day: 2, time: "18:30" },
  { modality: "GB2", day: 2, time: "19:30" },
  { modality: "GBF", day: 2, time: "19:30" },
  { modality: "GB1", day: 2, time: "20:30" },
  { modality: "GB NOGI", day: 2, time: "20:30" },

  // Quarta
  { modality: "GB1", day: 3, time: "07:00" },
  { modality: "GBK - Pequenos Campeões 1", day: 3, time: "09:00" },
  { modality: "GBK - Pequenos Campeões 2", day: 3, time: "09:00" },
  { modality: "GB1", day: 3, time: "12:00" },
  { modality: "GBK - Pequenos Campeões 1", day: 3, time: "17:30" },
  { modality: "GBK - Pequenos Campeões 2", day: 3, time: "17:30" },
  { modality: "GBK - Juniors", day: 3, time: "18:30" },
  { modality: "GB NOGI", day: 3, time: "19:30" },
  { modality: "GB2", day: 3, time: "20:30" },

  // Quinta
  { modality: "GB1", day: 4, time: "07:00" },
  { modality: "GBK - Pequenos Campeões 1", day: 4, time: "09:00" },
  { modality: "GBK - Pequenos Campeões 2", day: 4, time: "09:00" },
  { modality: "GB1", day: 4, time: "12:00" },
  { modality: "GBK - Juniors", day: 4, time: "17:30" },
  { modality: "GBA", day: 4, time: "17:30" },
  { modality: "BarraFit", day: 4, time: "17:30" },
  { modality: "GBK - Pequenos Campeões 1", day: 4, time: "18:30" },
  { modality: "GBK - Pequenos Campeões 2", day: 4, time: "18:30" },
  { modality: "GBA", day: 4, time: "18:30" },
  { modality: "BarraFit", day: 4, time: "18:30" },
  { modality: "GB2", day: 4, time: "19:30" },
  { modality: "GBF", day: 4, time: "19:30" },
  { modality: "GB1", day: 4, time: "20:30" },
  { modality: "GB NOGI", day: 4, time: "20:30" },

  // Sexta
  { modality: "GB1", day: 5, time: "07:00" },
  { modality: "GB1", day: 5, time: "12:00" },
  { modality: "GBK - Pequenos Campeões 1", day: 5, time: "17:30" },
  { modality: "GBK - Pequenos Campeões 2", day: 5, time: "17:30" },
  { modality: "GBK - Juniors", day: 5, time: "18:30" },
  { modality: "GB1", day: 5, time: "19:30" },
  { modality: "GB NOGI", day: 5, time: "19:30" },
  { modality: "GB2", day: 5, time: "20:30" },

  // Sábado
  { modality: "GB1", day: 6, time: "09:00" },
  { modality: "GB2", day: 6, time: "10:00" }, // Open Mat
];

const PLANS: Array<{ name: string; monthlyValue: number; description?: string }> = [
  { name: "Plano Fundadores", monthlyValue: 499.9 },
  { name: "Plano Mensal", monthlyValue: 599.9 },
  { name: "Plano Trimestral", monthlyValue: 549.9 },
  { name: "Plano Anual", monthlyValue: 449.9 },
];

/**
 * Estágios do funil — alinhados ao Playbook Oficial Comercial GB Anália Franco.
 *
 * 8 estágios canônicos. Sub-estados antigos ("Contatado", "Confirmado",
 * "Visitante GB", "Avulso") viraram tags acumuláveis no `Lead.tags` (não
 * são mais estágios mutuamente exclusivos).
 *
 * Migração de dados antigos: a migration `20260510_v11_*` mapeia leads em
 * stages legados pros novos + adiciona tag correspondente (ver SQL).
 */
const STAGES: Array<{
  name: string;
  color: string;
  order: number;
  isWon?: boolean;
  isLost?: boolean;
}> = [
  { name: "Novo Lead",      color: "#9CA3AF", order: 1 },
  { name: "Potencial",      color: "#93C5FD", order: 2 },
  { name: "Agendamento",    color: "#3B82F6", order: 3 },
  { name: "Comparecimento", color: "#FBBF24", order: 4 },
  { name: "Negociação",     color: "#F97316", order: 5 },
  { name: "Ganho",          color: "#10B981", order: 6, isWon: true },
  { name: "Perda",          color: "#EF4444", order: 7, isLost: true },
  { name: "Nutrição",       color: "#6B7280", order: 8 },
];

const TENANT_USERS: Array<{ email: string; name: string; role: Role }> = [
  { email: "gracie-admin@example.com", name: "Admin Gracie Barra", role: "ADMIN" },
  { email: "anna@gracie.com", name: "Anna", role: "SELLER" },
  { email: "evelyn@gracie.com", name: "Evelyn", role: "SELLER" },
  { email: "rafaela@gracie.com", name: "Rafaela", role: "SELLER" },
];

async function upsertSuperAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "bruno@simplificaonline.site";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "gracie-2026";
  const passwordHash = await bcrypt.hash(password, 10);

  return prisma.user.upsert({
    where: { email },
    update: { passwordHash, isSuperAdmin: true },
    create: {
      email,
      name: "Bruno",
      passwordHash,
      isSuperAdmin: true,
      emailVerified: new Date(),
    },
  });
}

async function upsertTenant() {
  return prisma.tenant.upsert({
    where: { slug: TENANT_SLUG },
    update: { active: true, name: TENANT_NAME },
    create: {
      slug: TENANT_SLUG,
      name: TENANT_NAME,
      primaryColor: "#C8102E",
      active: true,
    },
  });
}

async function upsertCatalog(tenantId: string) {
  for (const m of MODALITIES) {
    // Rebatizar (ex: GB3 → GBA): se existe pelo nome anterior e não pelo novo,
    // só rename. Mantém id, leads/matrículas existentes.
    if (m.previousName) {
      const old = await prisma.modality.findFirst({
        where: { tenantId, name: m.previousName },
      });
      const already = await prisma.modality.findFirst({
        where: { tenantId, name: m.name },
      });
      if (old && !already) {
        await prisma.modality.update({
          where: { id: old.id },
          data: {
            name: m.name,
            ageRange: m.ageRange,
            description: m.description,
            color: m.color,
            active: true,
          },
        });
        continue;
      }
    }

    const existing = await prisma.modality.findFirst({
      where: { tenantId, name: m.name },
    });
    if (existing) {
      await prisma.modality.update({
        where: { id: existing.id },
        data: {
          ageRange: m.ageRange,
          description: m.description,
          color: m.color,
          active: true,
        },
      });
    } else {
      await prisma.modality.create({
        data: {
          tenantId,
          name: m.name,
          ageRange: m.ageRange,
          description: m.description,
          color: m.color,
        },
      });
    }
  }

  for (const p of PLANS) {
    const existing = await prisma.plan.findFirst({
      where: { tenantId, name: p.name },
    });
    if (existing) {
      await prisma.plan.update({
        where: { id: existing.id },
        data: { monthlyValue: p.monthlyValue, description: p.description, active: true },
      });
    } else {
      await prisma.plan.create({
        data: { tenantId, name: p.name, monthlyValue: p.monthlyValue, description: p.description },
      });
    }
  }

  await upsertStagesWithLegacyMigration(tenantId);
}

/**
 * Mapeamento legacy v1.0 → v1.1.
 * Quando um lead está num stage legado, é movido pro stage novo + ganha
 * a tag correspondente (se houver). Stages legados não são deletados —
 * apenas marcados inactive — pra preservar referências de StageHistory.
 */
const LEGACY_STAGE_MAP: Record<string, { newName: string; tag?: string }> = {
  "Contatado":     { newName: "Novo Lead",      tag: "Contatado" },
  "Agendado":      { newName: "Agendamento" },
  "Confirmado":    { newName: "Agendamento",    tag: "Confirmado" },
  "Compareceu":    { newName: "Comparecimento" },
  "Matriculado":   { newName: "Ganho" },
  "Não Fechou":    { newName: "Perda",          tag: "Não Fechou" },
  "Aluno Perdido": { newName: "Perda",          tag: "Aluno Perdido" },
  "Visitante GB":  { newName: "Novo Lead",      tag: "VISITANTE GB" },
  "Avulso":        { newName: "Novo Lead",      tag: "AVULSO" },
};

async function upsertStagesWithLegacyMigration(tenantId: string) {
  // Snapshot do estado atual
  const existing = await prisma.stage.findMany({ where: { tenantId } });
  const legacyStages = existing.filter((s) => s.name in LEGACY_STAGE_MAP);

  // Step 1: deslocar legacies pra orders negativas (não vão mais aparecer
  // na UI por causa do `active=false`, e ficam fora do unique(tenantId, order))
  for (let i = 0; i < legacyStages.length; i++) {
    await prisma.stage.update({
      where: { id: legacyStages[i]!.id },
      data: { order: -(100 + i), active: false },
    });
  }

  // Step 2: upsert dos 8 stages novos por nome (mais estável que order)
  for (const s of STAGES) {
    const found = existing.find((x) => x.name === s.name);
    if (found) {
      await prisma.stage.update({
        where: { id: found.id },
        data: {
          color: s.color,
          order: s.order,
          isWon: s.isWon ?? false,
          isLost: s.isLost ?? false,
          active: true,
        },
      });
    } else {
      await prisma.stage.create({
        data: {
          tenantId,
          name: s.name,
          color: s.color,
          order: s.order,
          isWon: s.isWon ?? false,
          isLost: s.isLost ?? false,
        },
      });
    }
  }

  // Step 3: migrar leads dos stages legados pros novos + adicionar tag
  let migratedLeads = 0;
  for (const legacy of legacyStages) {
    const mapping = LEGACY_STAGE_MAP[legacy.name]!;
    const target = await prisma.stage.findFirst({
      where: { tenantId, name: mapping.newName },
    });
    if (!target) continue;

    const leadsInLegacy = await prisma.lead.findMany({
      where: { stageId: legacy.id },
      select: { id: true, tags: true },
    });
    for (const lead of leadsInLegacy) {
      const tags =
        mapping.tag && !lead.tags.includes(mapping.tag)
          ? [...lead.tags, mapping.tag]
          : lead.tags;
      await prisma.lead.update({
        where: { id: lead.id },
        data: { stageId: target.id, tags },
      });
      migratedLeads++;
    }
  }

  if (legacyStages.length > 0) {
    console.log(
      `  · migração legacy: ${legacyStages.length} stages → inactive, ${migratedLeads} leads movidos`,
    );
  }
}

async function upsertSchedule(tenantId: string) {
  // Estratégia: blow-and-rebuild da grade do tenant. ClassSchedule não tem
  // FK pra ExperimentalClass (aulas existentes não são afetadas), então
  // recriar é seguro e mantém a grade sincronizada com a fonte (este array).
  const modalities = await prisma.modality.findMany({ where: { tenantId } });
  const modalityByName = new Map(modalities.map((m) => [m.name, m.id]));

  await prisma.classSchedule.deleteMany({ where: { tenantId } });

  let inserted = 0;
  for (const slot of SCHEDULE) {
    const modalityId = modalityByName.get(slot.modality);
    if (!modalityId) {
      console.warn(`  · pulando slot — modalidade "${slot.modality}" não encontrada`);
      continue;
    }
    await prisma.classSchedule.create({
      data: {
        tenantId,
        modalityId,
        dayOfWeek: slot.day,
        startTime: slot.time,
        durationMinutes: slot.durationMinutes ?? 60,
      },
    });
    inserted++;
  }
  console.log(`✓ Grade semanal: ${inserted} slots`);
}

async function upsertTenantUser(params: {
  tenantId: string;
  email: string;
  name: string;
  role: Role;
  password?: string;
}) {
  const password = params.password ?? "gracie-2026";
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email: params.email },
    update: { name: params.name, passwordHash },
    create: {
      email: params.email,
      name: params.name,
      passwordHash,
      emailVerified: new Date(),
    },
  });

  await prisma.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: params.tenantId, userId: user.id } },
    update: { role: params.role, active: true },
    create: { tenantId: params.tenantId, userId: user.id, role: params.role },
  });

  return user;
}

async function main() {
  const superAdmin = await upsertSuperAdmin();
  console.log(`✓ Super-admin: ${superAdmin.email}`);

  const tenant = await upsertTenant();
  console.log(`✓ Tenant: ${tenant.name} (slug: ${tenant.slug})`);

  await upsertCatalog(tenant.id);
  console.log(
    `✓ Catálogo: ${MODALITIES.length} modalidades, ${PLANS.length} planos, ${STAGES.length} estágios`,
  );

  await upsertSchedule(tenant.id);

  // Bruno como ADMIN do tenant Gracie (além de super-admin global)
  await prisma.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: superAdmin.id } },
    update: { role: "ADMIN", active: true },
    create: { tenantId: tenant.id, userId: superAdmin.id, role: "ADMIN" },
  });

  for (const u of TENANT_USERS) {
    const user = await upsertTenantUser({
      tenantId: tenant.id,
      email: u.email,
      name: u.name,
      role: u.role,
    });
    console.log(`  · ${u.role.padEnd(7)} ${user.email}`);
  }

  console.log("✓ Seed completo");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

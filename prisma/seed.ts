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

const TENANT_SLUG = "gracie";

const MODALITIES: Array<{ name: string; ageRange?: string; description?: string }> = [
  { name: "GB1", ageRange: "16+", description: "Fundamentos" },
  { name: "GB2", ageRange: "16+", description: "Intermediário" },
  { name: "GB3", ageRange: "16+", description: "Avançado" },
  { name: "BarraFit" },
  { name: "GBF", description: "Feminino" },
  { name: "GBK - Pequenos Campeões 1", ageRange: "4-7" },
  { name: "GBK - Pequenos Campeões 2", ageRange: "8-9" },
  { name: "GBK - Juniors", ageRange: "10-15" },
];

const PLANS: Array<{ name: string; monthlyValue: number; description?: string }> = [
  { name: "Plano Fundadores", monthlyValue: 499.9 },
  { name: "Plano Mensal", monthlyValue: 599.9 },
  { name: "Plano Trimestral", monthlyValue: 549.9 },
  { name: "Plano Anual", monthlyValue: 449.9 },
];

const STAGES: Array<{
  name: string;
  color: string;
  order: number;
  isWon?: boolean;
  isLost?: boolean;
}> = [
  { name: "Novo Lead", color: "#9CA3AF", order: 1 },
  { name: "Contatado", color: "#93C5FD", order: 2 },
  { name: "Agendado", color: "#3B82F6", order: 3 },
  { name: "Confirmado", color: "#1E40AF", order: 4 },
  { name: "Compareceu", color: "#FBBF24", order: 5 },
  { name: "Negociação", color: "#F97316", order: 6 },
  { name: "Matriculado", color: "#10B981", order: 7, isWon: true },
  { name: "Não Fechou", color: "#EF4444", order: 8, isLost: true },
  { name: "Aluno Perdido", color: "#7F1D1D", order: 9, isLost: true },
  { name: "Visitante GB", color: "#4B5563", order: 10 },
  { name: "Avulso", color: "#A855F7", order: 11 },
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
    update: { active: true },
    create: {
      slug: TENANT_SLUG,
      name: "Gracie Barra Anália Franco",
      primaryColor: "#C8102E",
      active: true,
    },
  });
}

async function upsertCatalog(tenantId: string) {
  for (const m of MODALITIES) {
    const existing = await prisma.modality.findFirst({
      where: { tenantId, name: m.name },
    });
    if (existing) {
      await prisma.modality.update({
        where: { id: existing.id },
        data: { ageRange: m.ageRange, description: m.description, active: true },
      });
    } else {
      await prisma.modality.create({
        data: { tenantId, name: m.name, ageRange: m.ageRange, description: m.description },
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

  for (const s of STAGES) {
    await prisma.stage.upsert({
      where: { tenantId_order: { tenantId, order: s.order } },
      update: {
        name: s.name,
        color: s.color,
        isWon: s.isWon ?? false,
        isLost: s.isLost ?? false,
        active: true,
      },
      create: {
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

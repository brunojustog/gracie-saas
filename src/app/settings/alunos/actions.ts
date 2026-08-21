"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { buildTenantUrl } from "@/lib/tenant-url";
import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";
import { sendText } from "@/server/wuzapi";

type Result = { ok: true } | { ok: false; error: string };
/** Info do envio de acesso por WhatsApp anexada às respostas. */
type Wa = { sent: boolean; error?: string };

/**
 * v1.2-G: envia o acesso do aluno por WhatsApp (link + login, e senha quando
 * disponível). Best-effort — nunca derruba a ação principal. Usa a instância
 * Wuzapi do tenant.
 */
async function sendAccessWhatsapp(
  tenant: { slug: string; name: string; wuzapiUrl: string | null; wuzapiToken: string | null },
  phone: string | null,
  email: string,
  password?: string,
): Promise<Wa> {
  if (!phone) return { sent: false, error: "aluno sem telefone" };
  if (!tenant.wuzapiUrl || !tenant.wuzapiToken) {
    return { sent: false, error: "WhatsApp (Wuzapi) não configurado no tenant" };
  }
  const h = await headers();
  const link = buildTenantUrl({
    slug: tenant.slug,
    host: h.get("host") ?? "",
    forwardedProto: h.get("x-forwarded-proto"),
    path: "/login",
  });
  const body =
    `Olá! 🥋 Seu acesso ao app da ${tenant.name}:\n\n` +
    `🔗 ${link}\n` +
    `Login: ${email}\n` +
    (password ? `Senha: ${password}\n` : "") +
    `\nAbra no celular e instale como app: no Android toque em "Instalar o app"; ` +
    `no iPhone use Compartilhar → Adicionar à Tela de Início.`;
  const res = await sendText(
    { url: tenant.wuzapiUrl, token: tenant.wuzapiToken },
    { phone, body },
  );
  return res.ok ? { sent: true } : { sent: false, error: res.message };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const createSchema = z.object({
  name: z.string().min(2, "nome obrigatório"),
  phone: z.string().optional(),
  belt: z.string().optional(),
  beltDegree: z.coerce.number().int().min(0).max(6).optional(),
  matricula: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  birthDate: z.string().regex(DATE_RE).optional().or(z.literal("")),
  email: z.string().email("email inválido").toLowerCase(),
  password: z.string().min(6, "senha de no mínimo 6 caracteres"),
  sendWhatsapp: z.boolean().optional(),
});

/** "YYYY-MM-DD" → Date (meia-noite local) ou null. */
function parseBirth(s: string | undefined): Date | null {
  return s && DATE_RE.test(s) ? new Date(`${s}T00:00:00`) : null;
}

/**
 * v1.2-A: cria um aluno com acesso ao app. Cria User (login email/senha) +
 * TenantUser(ALUNO) + Lead (1:1) + Aluno, tudo numa transação. O lead entra no
 * estágio de matrícula (isWon) — ou no primeiro estágio, se não houver.
 */
export async function createAlunoAccess(
  input: unknown,
): Promise<{ ok: true; wa?: Wa } | { ok: false; error: string }> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "input inválido" };
  }
  const { tenant } = await requireRole("ADMIN");
  const d = parsed.data;

  const existing = await prisma.user.findUnique({
    where: { email: d.email },
    select: { id: true },
  });
  if (existing) {
    return { ok: false, error: "esse email já está em uso por outro usuário" };
  }

  const stage =
    (await prisma.stage.findFirst({
      where: { tenantId: tenant.id, isWon: true, active: true },
      orderBy: { order: "asc" },
      select: { id: true },
    })) ??
    (await prisma.stage.findFirst({
      where: { tenantId: tenant.id, active: true },
      orderBy: { order: "asc" },
      select: { id: true },
    }));
  if (!stage) return { ok: false, error: "nenhum estágio do funil configurado" };

  if (d.matricula) {
    const dupe = await prisma.aluno.findFirst({
      where: { tenantId: tenant.id, matricula: d.matricula },
      select: { id: true },
    });
    if (dupe) return { ok: false, error: "já existe um aluno com essa matrícula" };
  }

  const passwordHash = await bcrypt.hash(d.password, 10);

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: d.email, name: d.name, passwordHash },
    });
    await tx.tenantUser.create({
      data: { tenantId: tenant.id, userId: user.id, role: "ALUNO", active: true },
    });
    const lead = await tx.lead.create({
      data: {
        tenantId: tenant.id,
        name: d.name,
        phone: d.phone || null,
        email: d.email,
        belt: d.belt || null,
        beltDegree: d.beltDegree ?? null,
        gender: d.gender ?? null,
        birthDate: parseBirth(d.birthDate),
        stageId: stage.id,
        origin: "OTHER",
      },
    });
    await tx.aluno.create({
      data: {
        tenantId: tenant.id,
        leadId: lead.id,
        userId: user.id,
        matricula: d.matricula || null,
        active: true,
      },
    });
  });

  let wa: Wa | undefined;
  if (d.sendWhatsapp) {
    wa = await sendAccessWhatsapp(tenant, d.phone || null, d.email, d.password);
  }

  revalidatePath("/settings/alunos");
  return { ok: true, wa };
}

const updateSchema = z.object({
  alunoId: z.string().min(1),
  name: z.string().min(2, "nome obrigatório"),
  phone: z.string().optional(),
  email: z.string().email("email inválido").toLowerCase(),
  matricula: z.string().optional(),
  belt: z.string().optional(),
  beltDegree: z.coerce.number().int().min(0).max(6).optional(),
  gender: z.enum(["MALE", "FEMALE"]).optional(),
  birthDate: z.string().regex(DATE_RE).optional().or(z.literal("")),
  active: z.boolean(),
});

/** v1.2-E: edita a ficha do aluno (dados, faixa/grau, matrícula, login). */
export async function updateAluno(input: unknown): Promise<Result> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "input inválido" };
  }
  const { tenant } = await requireRole("ADMIN");
  const d = parsed.data;

  const aluno = await prisma.aluno.findFirst({
    where: { id: d.alunoId, tenantId: tenant.id },
    select: { id: true, leadId: true, userId: true },
  });
  if (!aluno) return { ok: false, error: "aluno não encontrado" };

  if (d.matricula) {
    const dupe = await prisma.aluno.findFirst({
      where: { tenantId: tenant.id, matricula: d.matricula, id: { not: aluno.id } },
      select: { id: true },
    });
    if (dupe) return { ok: false, error: "já existe outro aluno com essa matrícula" };
  }

  // Email é o login: se mudou, garante que não colide com outro usuário.
  if (aluno.userId) {
    const other = await prisma.user.findFirst({
      where: { email: d.email, id: { not: aluno.userId } },
      select: { id: true },
    });
    if (other) return { ok: false, error: "esse email já está em uso por outro usuário" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.lead.update({
      where: { id: aluno.leadId },
      data: {
        name: d.name,
        phone: d.phone || null,
        email: d.email,
        belt: d.belt || null,
        beltDegree: d.belt ? d.beltDegree ?? 0 : null,
        gender: d.gender ?? null,
        birthDate: parseBirth(d.birthDate),
      },
    });
    await tx.aluno.update({
      where: { id: aluno.id },
      data: { matricula: d.matricula || null, active: d.active },
    });
    if (aluno.userId) {
      await tx.user.update({
        where: { id: aluno.userId },
        data: { name: d.name, email: d.email },
      });
      await tx.tenantUser.updateMany({
        where: { tenantId: tenant.id, userId: aluno.userId, role: "ALUNO" },
        data: { active: d.active },
      });
    }
  });

  revalidatePath("/settings/alunos");
  return { ok: true };
}

/** v1.2-E/G: redefine a senha de acesso do aluno (e opcionalmente avisa no zap). */
export async function resetAlunoPassword(
  input: unknown,
): Promise<{ ok: true; wa?: Wa } | { ok: false; error: string }> {
  const parsed = z
    .object({
      alunoId: z.string().min(1),
      password: z.string().min(6, "senha de no mínimo 6 caracteres"),
      sendWhatsapp: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "input inválido" };
  }
  const { tenant } = await requireRole("ADMIN");

  const aluno = await prisma.aluno.findFirst({
    where: { id: parsed.data.alunoId, tenantId: tenant.id },
    select: {
      userId: true,
      lead: { select: { phone: true, email: true } },
      user: { select: { email: true } },
    },
  });
  if (!aluno?.userId) return { ok: false, error: "aluno sem login" };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: aluno.userId },
    data: { passwordHash },
  });

  let wa: Wa | undefined;
  if (parsed.data.sendWhatsapp) {
    const email = aluno.user?.email ?? aluno.lead.email ?? "";
    wa = await sendAccessWhatsapp(tenant, aluno.lead.phone, email, parsed.data.password);
  }

  revalidatePath("/settings/alunos");
  return { ok: true, wa };
}

/** v1.2-G: envia o link + login do aluno por WhatsApp (sem senha). */
export async function sendAlunoAccess(input: unknown): Promise<Result & { wa?: Wa }> {
  const parsed = z.object({ alunoId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  const aluno = await prisma.aluno.findFirst({
    where: { id: parsed.data.alunoId, tenantId: tenant.id },
    select: {
      lead: { select: { phone: true, email: true } },
      user: { select: { email: true } },
    },
  });
  if (!aluno) return { ok: false, error: "aluno não encontrado" };

  const email = aluno.user?.email ?? aluno.lead.email ?? "";
  if (!email) return { ok: false, error: "aluno sem login (email)" };

  const wa = await sendAccessWhatsapp(tenant, aluno.lead.phone, email);
  if (!wa.sent) return { ok: false, error: wa.error ?? "falha no envio" };
  return { ok: true };
}

/** Ativa/inativa o acesso de um aluno (sem apagar histórico). */
export async function toggleAluno(input: unknown): Promise<Result> {
  const parsed = z
    .object({ alunoId: z.string().min(1), active: z.boolean() })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  const aluno = await prisma.aluno.findFirst({
    where: { id: parsed.data.alunoId, tenantId: tenant.id },
    select: { id: true, userId: true },
  });
  if (!aluno) return { ok: false, error: "aluno não encontrado" };

  await prisma.aluno.update({
    where: { id: aluno.id },
    data: { active: parsed.data.active },
  });
  // Espelha no acesso de login (TenantUser).
  if (aluno.userId) {
    await prisma.tenantUser.updateMany({
      where: { tenantId: tenant.id, userId: aluno.userId, role: "ALUNO" },
      data: { active: parsed.data.active },
    });
  }
  revalidatePath("/settings/alunos");
  return { ok: true };
}

const locationSchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radiusMeters: z.coerce.number().int().min(100).max(50_000),
});

/** v1.2-A: define a coordenada da academia + raio do geofence do check-in. */
export async function setAcademyLocation(input: unknown): Promise<Result> {
  const parsed = locationSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "input inválido" };
  }
  const { tenant } = await requireRole("ADMIN");
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      latitude: parsed.data.latitude,
      longitude: parsed.data.longitude,
      checkinRadiusMeters: parsed.data.radiusMeters,
    },
  });
  revalidatePath("/settings/alunos");
  return { ok: true };
}

/** Desliga o geofence (check-in aceita qualquer localização). */
export async function clearAcademyLocation(): Promise<Result> {
  const { tenant } = await requireRole("ADMIN");
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { latitude: null, longitude: null },
  });
  revalidatePath("/settings/alunos");
  return { ok: true };
}

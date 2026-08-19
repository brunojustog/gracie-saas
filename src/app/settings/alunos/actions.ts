"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

const createSchema = z.object({
  name: z.string().min(2, "nome obrigatório"),
  phone: z.string().optional(),
  belt: z.string().optional(),
  beltDegree: z.coerce.number().int().min(0).max(6).optional(),
  matricula: z.string().optional(),
  email: z.string().email("email inválido").toLowerCase(),
  password: z.string().min(6, "senha de no mínimo 6 caracteres"),
});

/**
 * v1.2-A: cria um aluno com acesso ao app. Cria User (login email/senha) +
 * TenantUser(ALUNO) + Lead (1:1) + Aluno, tudo numa transação. O lead entra no
 * estágio de matrícula (isWon) — ou no primeiro estágio, se não houver.
 */
export async function createAlunoAccess(input: unknown): Promise<Result> {
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

  revalidatePath("/settings/alunos");
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

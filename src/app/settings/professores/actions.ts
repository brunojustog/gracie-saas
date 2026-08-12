"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

const createSchema = z.object({
  name: z.string().min(1).max(120),
});

export async function createProfessor(input: unknown): Promise<Result> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  const name = parsed.data.name.trim();
  const existing = await prisma.professor.findFirst({
    where: { tenantId: tenant.id, name },
  });
  if (existing) return { ok: false, error: `já existe professor "${name}"` };

  await prisma.professor.create({ data: { tenantId: tenant.id, name } });
  revalidatePath("/settings/professores");
  revalidatePath("/particulares");
  return { ok: true };
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  active: z.boolean(),
  email: z.string().email().max(200).nullable().optional().or(z.literal("")),
  // v1.1-CB: userId do login vinculado (ou null pra desvincular).
  userId: z.string().min(1).nullable().optional(),
  // v1.1-CH: hora-aula (base da bonificação por conversão). Preta 70, marrom 60.
  hourlyRate: z.number().nonnegative().max(100000).optional(),
});

export async function updateProfessor(input: unknown): Promise<Result> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  const target = await prisma.professor.findFirst({
    where: { id: parsed.data.id, tenantId: tenant.id },
  });
  if (!target) return { ok: false, error: "professor não encontrado" };

  // Se veio userId, valida: usuário do tenant e não vinculado a outro professor.
  let userId: string | null | undefined = parsed.data.userId;
  if (userId) {
    const tu = await prisma.tenantUser.findFirst({
      where: { tenantId: tenant.id, userId, active: true },
      select: { userId: true },
    });
    if (!tu) return { ok: false, error: "usuário não é membro do tenant" };
    const clash = await prisma.professor.findFirst({
      where: { userId, tenantId: tenant.id, id: { not: target.id } },
      select: { id: true },
    });
    if (clash) return { ok: false, error: "esse login já está vinculado a outro professor" };
  }

  await prisma.professor.update({
    where: { id: target.id },
    data: {
      name: parsed.data.name.trim(),
      active: parsed.data.active,
      email: parsed.data.email ? parsed.data.email.trim() : null,
      // undefined = não mexe; null = desvincula; string = vincula.
      ...(userId !== undefined ? { userId } : {}),
      ...(parsed.data.hourlyRate !== undefined ? { hourlyRate: parsed.data.hourlyRate } : {}),
    },
  });
  revalidatePath("/settings/professores");
  revalidatePath("/particulares");
  revalidatePath("/quadro");
  return { ok: true };
}

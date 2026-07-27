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
});

export async function updateProfessor(input: unknown): Promise<Result> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  const target = await prisma.professor.findFirst({
    where: { id: parsed.data.id, tenantId: tenant.id },
  });
  if (!target) return { ok: false, error: "professor não encontrado" };

  await prisma.professor.update({
    where: { id: target.id },
    data: { name: parsed.data.name.trim(), active: parsed.data.active },
  });
  revalidatePath("/settings/professores");
  revalidatePath("/particulares");
  revalidatePath("/quadro");
  return { ok: true };
}

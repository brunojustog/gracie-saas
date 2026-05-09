"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

const createSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  ageRange: z.string().max(50).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
});

export async function createModality(input: unknown): Promise<Result> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  // Nome único dentro do tenant (não tem unique no schema; faço check)
  const existing = await prisma.modality.findFirst({
    where: { tenantId: tenant.id, name: parsed.data.name },
  });
  if (existing) return { ok: false, error: `já existe modalidade "${parsed.data.name}"` };

  await prisma.modality.create({
    data: {
      tenantId: tenant.id,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      ageRange: parsed.data.ageRange ?? null,
      color: parsed.data.color ?? null,
    },
  });
  revalidatePath("/settings/modalidades");
  return { ok: true };
}

const updateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(100),
  description: z.string().max(500).nullable().optional(),
  ageRange: z.string().max(50).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional(),
  active: z.boolean(),
});

export async function updateModality(input: unknown): Promise<Result> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  const target = await prisma.modality.findFirst({
    where: { id: parsed.data.id, tenantId: tenant.id },
  });
  if (!target) return { ok: false, error: "modalidade não encontrada" };

  await prisma.modality.update({
    where: { id: target.id },
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      ageRange: parsed.data.ageRange ?? null,
      color: parsed.data.color ?? null,
      active: parsed.data.active,
    },
  });
  revalidatePath("/settings/modalidades");
  revalidatePath("/aulas");
  revalidatePath("/kanban");
  return { ok: true };
}

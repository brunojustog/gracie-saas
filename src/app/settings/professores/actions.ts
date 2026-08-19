"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };
type UpdateResult =
  | { ok: true; deactivatedSlots?: number }
  | { ok: false; error: string };

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

export async function updateProfessor(input: unknown): Promise<UpdateResult> {
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

  // v1.2-F: inativação segura — ao inativar, desativa também as aulas da grade
  // dele (senão continuam gerando sessão e aparecendo no cronograma). NADA é
  // apagado: TaughtClass, sessões, presenças e NFs ficam intactos no histórico.
  const inactivating = target.active && !parsed.data.active;
  let deactivatedSlots = 0;

  await prisma.$transaction(async (tx) => {
    await tx.professor.update({
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
    if (inactivating) {
      const res = await tx.classGridSlot.updateMany({
        where: { tenantId: tenant.id, professorId: target.id, active: true },
        data: { active: false },
      });
      deactivatedSlots = res.count;
    }
  });

  revalidatePath("/settings/professores");
  revalidatePath("/settings/grade");
  revalidatePath("/particulares");
  revalidatePath("/quadro");
  revalidatePath("/aluno");
  return { ok: true, deactivatedSlots };
}

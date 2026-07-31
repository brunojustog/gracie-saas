"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

/**
 * v1.1-CE: o Anderson (ADMIN) edita/exclui registros de aula dada sem depender
 * do dev. Ex.: tirar um auxiliar marcado por engano, trocar o professor de uma
 * aula transferida, ou apagar uma confirmação errada.
 */

const editSchema = z.object({
  id: z.string().min(1),
  professorId: z.string().min(1),
  auxProfessorId: z.string().min(1).nullable().optional(),
});

export async function adminEditTaughtClass(input: unknown): Promise<Result> {
  const parsed = editSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  const t = await prisma.taughtClass.findFirst({
    where: { id: parsed.data.id, tenantId: tenant.id },
    select: { id: true, isKids: true },
  });
  if (!t) return { ok: false, error: "aula não encontrada" };

  const prof = await prisma.professor.findFirst({
    where: { id: parsed.data.professorId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!prof) return { ok: false, error: "professor inválido" };

  let auxProfessorId: string | null = parsed.data.auxProfessorId ?? null;
  if (auxProfessorId) {
    if (auxProfessorId === parsed.data.professorId) {
      return { ok: false, error: "o auxiliar precisa ser outro professor" };
    }
    const aux = await prisma.professor.findFirst({
      where: { id: auxProfessorId, tenantId: tenant.id },
      select: { id: true },
    });
    if (!aux) return { ok: false, error: "auxiliar inválido" };
  }

  await prisma.taughtClass.update({
    where: { id: t.id },
    data: { professorId: parsed.data.professorId, auxProfessorId },
  });
  revalidatePath("/professores");
  revalidatePath("/professor");
  return { ok: true };
}

export async function adminDeleteTaughtClass(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  const t = await prisma.taughtClass.findFirst({
    where: { id: parsed.data.id, tenantId: tenant.id },
    select: { id: true },
  });
  if (!t) return { ok: false, error: "aula não encontrada" };
  await prisma.taughtClass.delete({ where: { id: t.id } });
  revalidatePath("/professores");
  revalidatePath("/professor");
  return { ok: true };
}

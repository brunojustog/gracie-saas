"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireProfessor } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

const MAX_PHOTO = 6 * 1024 * 1024; // 6 MB

const fieldsSchema = z.object({
  alunoId: z.string().min(1),
  belt: z.string().min(1, "faixa obrigatória"),
  beltDegree: z.coerce.number().int().min(0).max(6),
  note: z.string().max(280).optional(),
});

/**
 * v1.2-C: professor gradua o aluno (celular). Atualiza a faixa atual e grava o
 * evento na linha do tempo, com foto opcional do momento. Graduação é sempre
 * decisão do professor (assistida) — nada automático.
 */
export async function graduateAluno(formData: FormData): Promise<Result> {
  const { tenant, professor, membership } = await requireProfessor();
  const isAdmin = membership.role === "ADMIN";
  if (!professor && !isAdmin) {
    return { ok: false, error: "seu usuário não está vinculado a um professor" };
  }

  const parsed = fieldsSchema.safeParse({
    alunoId: formData.get("alunoId"),
    belt: formData.get("belt"),
    beltDegree: formData.get("beltDegree"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "input inválido" };
  }
  const d = parsed.data;

  const aluno = await prisma.aluno.findFirst({
    where: { id: d.alunoId, tenantId: tenant.id },
    select: { id: true, leadId: true },
  });
  if (!aluno) return { ok: false, error: "aluno não encontrado" };

  // Foto opcional.
  let photoData: Uint8Array<ArrayBuffer> | null = null;
  let photoMime: string | null = null;
  const file = formData.get("photo");
  if (file instanceof File && file.size > 0) {
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "a foto precisa ser uma imagem" };
    }
    if (file.size > MAX_PHOTO) {
      return { ok: false, error: "foto grande demais (máx. 6 MB)" };
    }
    const buf = await file.arrayBuffer();
    photoData = new Uint8Array(buf);
    photoMime = file.type;
  }

  const now = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.graduation.create({
      data: {
        tenantId: tenant.id,
        alunoId: aluno.id,
        belt: d.belt,
        beltDegree: d.beltDegree,
        graduatedAt: now,
        professorId: professor?.id ?? null,
        photoData,
        photoMime,
        note: d.note || null,
      },
    });
    // Atualiza a faixa atual (fica no Lead) + marca a data da graduação.
    await tx.lead.update({
      where: { id: aluno.leadId },
      data: { belt: d.belt, beltDegree: d.beltDegree },
    });
    await tx.aluno.update({
      where: { id: aluno.id },
      data: { lastGraduationAt: now },
    });
  });

  revalidatePath("/professor/graduar");
  revalidatePath("/aluno");
  return { ok: true };
}

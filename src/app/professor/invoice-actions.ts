"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireProfessor } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — folga grande pra um PDF de NF.
const COMPETENCIA_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Carrega o professor logado (mesmo padrão de actions.ts). */
async function currentProfessor(): Promise<
  | { ok: true; tenantId: string; professorId: string }
  | { ok: false; error: string }
> {
  const { tenant, professor } = await requireProfessor();
  if (!professor) {
    return { ok: false, error: "seu usuário não está vinculado a um professor" };
  }
  return { ok: true, tenantId: tenant.id, professorId: professor.id };
}

/**
 * v1.1-CJ: o professor anexa a NF (PDF) da competência. Guarda os bytes no
 * Postgres. Aceita só application/pdf até 10 MB.
 */
export async function uploadInvoice(formData: FormData): Promise<Result> {
  const ctx = await currentProfessor();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const competencia = String(formData.get("competencia") ?? "");
  if (!COMPETENCIA_RE.test(competencia)) {
    return { ok: false, error: "mês de competência inválido" };
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "selecione um PDF pra anexar" };
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return { ok: false, error: "o arquivo precisa ser um PDF" };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: "PDF grande demais (máx. 10 MB)" };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  // Nome de arquivo limpo (evita path/estranhos), com fallback.
  const safeName =
    file.name.replace(/[^\w.\-() ]+/g, "_").slice(0, 120) || "nota-fiscal.pdf";

  await prisma.professorInvoice.create({
    data: {
      tenantId: ctx.tenantId,
      professorId: ctx.professorId,
      competencia,
      fileName: safeName,
      mimeType: "application/pdf",
      size: file.size,
      data: bytes,
    },
  });

  revalidatePath("/professor");
  revalidatePath("/professores");
  return { ok: true };
}

/** v1.1-CJ: o professor remove uma NF que ele mesmo enviou (ex.: errada). */
export async function deleteInvoice(input: unknown): Promise<Result> {
  const parsed = z.object({ id: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const ctx = await currentProfessor();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const inv = await prisma.professorInvoice.findFirst({
    where: { id: parsed.data.id, tenantId: ctx.tenantId, professorId: ctx.professorId },
    select: { id: true },
  });
  if (!inv) return { ok: false, error: "nota fiscal não encontrada" };
  await prisma.professorInvoice.delete({ where: { id: inv.id } });

  revalidatePath("/professor");
  revalidatePath("/professores");
  return { ok: true };
}

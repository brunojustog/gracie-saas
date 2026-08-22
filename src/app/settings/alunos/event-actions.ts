"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

const KINDS = ["GRADUACAO", "GRAU", "CAMPEONATO", "INICIO", "OUTRO"] as const;
const MAX_PHOTO = 6 * 1024 * 1024;

/** v1.2-U: adiciona um evento na linha do tempo do aluno (com fotos). */
export async function addTimelineEvent(formData: FormData): Promise<Result> {
  const { tenant } = await requireRole("ADMIN");

  const parsed = z
    .object({
      alunoId: z.string().min(1),
      kind: z.enum(KINDS),
      title: z.string().min(1, "título obrigatório").max(120),
      eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "data inválida"),
      note: z.string().max(400).optional(),
    })
    .safeParse({
      alunoId: formData.get("alunoId"),
      kind: formData.get("kind"),
      title: formData.get("title"),
      eventDate: formData.get("eventDate"),
      note: formData.get("note") || undefined,
    });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "input inválido" };
  }
  const d = parsed.data;

  const aluno = await prisma.aluno.findFirst({
    where: { id: d.alunoId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!aluno) return { ok: false, error: "aluno não encontrado" };

  // Fotos (0..N).
  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  const photos: { data: Uint8Array<ArrayBuffer>; mime: string }[] = [];
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return { ok: false, error: "todas as fotos precisam ser imagens" };
    }
    if (file.size > MAX_PHOTO) {
      return { ok: false, error: "foto grande demais (máx. 6 MB)" };
    }
    photos.push({ data: new Uint8Array(await file.arrayBuffer()), mime: file.type });
  }

  await prisma.timelineEvent.create({
    data: {
      tenantId: tenant.id,
      alunoId: aluno.id,
      kind: d.kind,
      title: d.title,
      eventDate: new Date(`${d.eventDate}T00:00:00`),
      note: d.note || null,
      photos: photos.length > 0 ? { create: photos } : undefined,
    },
  });

  revalidatePath("/settings/alunos");
  revalidatePath("/aluno");
  return { ok: true };
}

/** v1.2-U: remove um evento da linha do tempo. */
export async function deleteTimelineEvent(input: unknown): Promise<Result> {
  const parsed = z.object({ eventId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  const ev = await prisma.timelineEvent.findFirst({
    where: { id: parsed.data.eventId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!ev) return { ok: false, error: "evento não encontrado" };
  await prisma.timelineEvent.delete({ where: { id: ev.id } });

  revalidatePath("/settings/alunos");
  revalidatePath("/aluno");
  return { ok: true };
}

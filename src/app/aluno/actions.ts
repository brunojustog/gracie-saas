"use server";

import bcrypt from "bcryptjs";
import { startOfDay } from "date-fns";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { distanceMeters } from "@/lib/geo";
import { prisma } from "@/lib/prisma";
import { requireAluno } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

async function currentAluno(): Promise<
  | { ok: true; tenantId: string; alunoId: string }
  | { ok: false; error: string }
> {
  const { tenant, aluno } = await requireAluno();
  if (!aluno) {
    return { ok: false, error: "seu usuário não está vinculado a um aluno" };
  }
  return { ok: true, tenantId: tenant.id, alunoId: aluno.id };
}

const checkinSchema = z.object({
  sessionId: z.string().min(1),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

/** v1.2-A: aluno faz check-in numa aula do dia (valida o raio da academia). */
export async function checkInToSession(input: unknown): Promise<Result> {
  const parsed = checkinSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const ctx = await currentAluno();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const session = await prisma.classSession.findFirst({
    where: { id: parsed.data.sessionId, tenantId: ctx.tenantId },
    select: { id: true, date: true, checkinLimit: true, _count: { select: { checkIns: true } } },
  });
  if (!session) return { ok: false, error: "aula não encontrada" };

  // Só dá pra bater presença no próprio dia da aula.
  const today = startOfDay(new Date()).getTime();
  if (startOfDay(session.date).getTime() !== today) {
    return { ok: false, error: "só dá pra bater presença no dia da aula" };
  }

  // Geofence: se a academia tem coordenada, valida a distância.
  const tenant = await prisma.tenant.findUnique({
    where: { id: ctx.tenantId },
    select: { latitude: true, longitude: true, checkinRadiusMeters: true },
  });
  let distanceM: number | null = null;
  if (tenant?.latitude != null && tenant?.longitude != null) {
    if (parsed.data.lat == null || parsed.data.lng == null) {
      return {
        ok: false,
        error: "não consegui pegar sua localização — permita o GPS e tente de novo",
      };
    }
    distanceM = distanceMeters(
      { lat: Number(tenant.latitude), lng: Number(tenant.longitude) },
      { lat: parsed.data.lat, lng: parsed.data.lng },
    );
    if (distanceM > tenant.checkinRadiusMeters) {
      return {
        ok: false,
        error: `você está a ${(distanceM / 1000).toFixed(1)} km da academia — chegue mais perto pra bater presença`,
      };
    }
  }

  // Limite de check-ins (0 = sem limite). Não bloqueia quem já bateu.
  const already = await prisma.checkIn.findUnique({
    where: { sessionId_alunoId: { sessionId: session.id, alunoId: ctx.alunoId } },
    select: { id: true },
  });
  if (!already && session.checkinLimit > 0 && session._count.checkIns >= session.checkinLimit) {
    return { ok: false, error: "essa aula já atingiu o limite de check-ins" };
  }

  await prisma.checkIn.upsert({
    where: { sessionId_alunoId: { sessionId: session.id, alunoId: ctx.alunoId } },
    create: {
      tenantId: ctx.tenantId,
      sessionId: session.id,
      alunoId: ctx.alunoId,
      source: "ALUNO",
      latitude: parsed.data.lat,
      longitude: parsed.data.lng,
      distanceM,
    },
    update: {},
  });
  revalidatePath("/aluno");
  return { ok: true };
}

/** v1.2-S: o aluno edita o próprio contato (telefone). */
export async function updateMyContact(input: unknown): Promise<Result> {
  const parsed = z.object({ phone: z.string().max(30).optional() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant, aluno } = await requireAluno();
  if (!aluno) return { ok: false, error: "sem vínculo de aluno" };
  const row = await prisma.aluno.findFirst({
    where: { id: aluno.id, tenantId: tenant.id },
    select: { leadId: true },
  });
  if (!row) return { ok: false, error: "aluno não encontrado" };
  await prisma.lead.update({
    where: { id: row.leadId },
    data: { phone: parsed.data.phone || null },
  });
  revalidatePath("/aluno/perfil");
  return { ok: true };
}

/** v1.2-S: o aluno troca a própria senha. */
export async function changeMyPassword(input: unknown): Promise<Result> {
  const parsed = z
    .object({ password: z.string().min(6, "senha de no mínimo 6 caracteres") })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "input inválido" };
  }
  const { user } = await requireAluno();
  const hash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hash } });
  return { ok: true };
}

/** v1.2-I: o aluno sobe/troca a própria foto de perfil (avatar). */
export async function uploadMyPhoto(formData: FormData): Promise<Result> {
  const ctx = await currentAluno();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "selecione uma imagem" };
  }
  if (!file.type.startsWith("image/")) {
    return { ok: false, error: "o arquivo precisa ser uma imagem" };
  }
  if (file.size > 5 * 1024 * 1024) {
    return { ok: false, error: "imagem grande demais (máx. 5 MB)" };
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  await prisma.aluno.update({
    where: { id: ctx.alunoId },
    data: { photoData: bytes, photoMime: file.type },
  });
  revalidatePath("/aluno");
  return { ok: true };
}

/** v1.2-A: desfaz o próprio check-in (enquanto o professor não confirmou). */
export async function undoCheckIn(input: unknown): Promise<Result> {
  const parsed = z.object({ sessionId: z.string().min(1) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const ctx = await currentAluno();
  if (!ctx.ok) return { ok: false, error: ctx.error };

  const checkin = await prisma.checkIn.findUnique({
    where: { sessionId_alunoId: { sessionId: parsed.data.sessionId, alunoId: ctx.alunoId } },
    select: { id: true, present: true },
  });
  if (!checkin) return { ok: false, error: "check-in não encontrado" };
  if (checkin.present) {
    return { ok: false, error: "o professor já confirmou sua presença" };
  }
  await prisma.checkIn.delete({ where: { id: checkin.id } });
  revalidatePath("/aluno");
  return { ok: true };
}

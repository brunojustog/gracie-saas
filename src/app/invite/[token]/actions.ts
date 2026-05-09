"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";

import { prisma } from "@/lib/prisma";

export type InviteStatus =
  | { kind: "valid"; identifier: string }
  | { kind: "missing" }
  | { kind: "expired" };

/**
 * Resolve o estado do convite a partir do token. Mantém `Date.now()` fora do
 * Server Component (regra `react-hooks/purity`).
 */
export async function checkInviteStatus(token: string): Promise<InviteStatus> {
  const stored = await prisma.verificationToken.findUnique({
    where: { token },
  });
  if (!stored) return { kind: "missing" };
  if (stored.expires.getTime() < Date.now()) return { kind: "expired" };
  return { kind: "valid", identifier: stored.identifier };
}

const acceptSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(200),
});

export type AcceptInviteResult =
  | { ok: true; email: string }
  | { ok: false; error: string };

export async function acceptInvite(input: unknown): Promise<AcceptInviteResult> {
  const parsed = acceptSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const stored = await prisma.verificationToken.findUnique({
    where: { token: parsed.data.token },
  });
  if (!stored) return { ok: false, error: "convite inválido ou já usado" };
  if (stored.expires.getTime() < Date.now()) {
    await prisma.verificationToken.delete({ where: { token: stored.token } });
    return { ok: false, error: "convite expirado — peça um novo" };
  }

  const user = await prisma.user.findUnique({ where: { email: stored.identifier } });
  if (!user) return { ok: false, error: "usuário do convite não existe" };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        emailVerified: new Date(),
      },
    });
    // Ativa todas as memberships pendentes desse user (caso convidado pra
    // mais de um tenant — corner case mas seguro)
    await tx.tenantUser.updateMany({
      where: { userId: user.id, active: false },
      data: { active: true },
    });
    await tx.verificationToken.delete({ where: { token: stored.token } });
  });

  return { ok: true, email: user.email };
}

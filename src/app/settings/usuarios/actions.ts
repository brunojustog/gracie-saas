"use server";

import { randomBytes } from "node:crypto";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Role } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { buildTenantUrl } from "@/lib/tenant-url";
import { sendInviteEmail, emailMode } from "@/server/email";
import { requireRole } from "@/server/tenant";

const ROLE_VALUES = ["ADMIN", "MANAGER", "SELLER"] as const satisfies readonly Role[];

const inviteSchema = z.object({
  email: z.string().email().toLowerCase(),
  role: z.enum(ROLE_VALUES),
});

const TOKEN_TTL_DAYS = 7;

export type InviteResult =
  | { ok: true; mode: "sent" | "logged"; inviteUrl: string }
  | { ok: false; error: string };

export async function inviteUser(input: unknown): Promise<InviteResult> {
  const parsed = inviteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant, user: inviter } = await requireRole("ADMIN");

  const email = parsed.data.email;

  // User existe? Reusa. Senão, cria sem password.
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: { email, name: email.split("@")[0]! },
    });
  }

  // Já é membro ATIVO desse tenant? Recusa.
  const existingMember = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
  });
  if (existingMember?.active) {
    return { ok: false, error: "esse email já é membro ativo deste tenant" };
  }

  // Cria/atualiza membership inativo
  await prisma.tenantUser.upsert({
    where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
    create: {
      tenantId: tenant.id,
      userId: user.id,
      role: parsed.data.role,
      active: false,
    },
    update: { role: parsed.data.role, active: false },
  });

  // Token de convite (32 bytes hex)
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  // Limpa tokens antigos pra esse email + cria novo
  await prisma.verificationToken.deleteMany({ where: { identifier: email } });
  await prisma.verificationToken.create({
    data: { identifier: email, token, expires },
  });

  // URL do invite no subdomínio do tenant
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto");
  const inviteUrl = buildTenantUrl({
    slug: tenant.slug,
    host,
    forwardedProto: proto,
    path: `/invite/${token}`,
  });

  const sendResult = await sendInviteEmail({
    to: email,
    inviterName: inviter.name ?? inviter.email,
    tenantName: tenant.name,
    inviteUrl,
  });
  if (!sendResult.ok) {
    return { ok: false, error: `email falhou: ${sendResult.error}` };
  }

  revalidatePath("/settings/usuarios");
  return { ok: true, mode: emailMode, inviteUrl };
}

const updateMembershipSchema = z.object({
  userId: z.string().min(1),
  role: z.enum(ROLE_VALUES).optional(),
  active: z.boolean().optional(),
});

export async function updateMembership(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = updateMembershipSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant, user: actor } = await requireRole("ADMIN");

  if (parsed.data.userId === actor.id) {
    return { ok: false, error: "você não pode alterar sua própria membership" };
  }

  const target = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: parsed.data.userId } },
  });
  if (!target) return { ok: false, error: "usuário não encontrado nesse tenant" };

  await prisma.tenantUser.update({
    where: { id: target.id },
    data: {
      ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
    },
  });

  revalidatePath("/settings/usuarios");
  return { ok: true };
}

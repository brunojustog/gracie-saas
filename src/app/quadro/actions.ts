"use server";

import { randomUUID } from "crypto";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

/**
 * Gera (ou regenera) o token do link público do Quadro (v1.1-BF). Regerar
 * troca o token — o link anterior para de funcionar (revogação). ADMIN-only.
 */
export async function regeneratePublicQuadroLink(): Promise<
  { ok: true; token: string } | { ok: false; error: string }
> {
  const { tenant } = await requireRole("ADMIN");
  const token = randomUUID().replace(/-/g, "");
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { publicQuadroToken: token },
  });
  revalidatePath("/quadro");
  return { ok: true, token };
}

/** Desativa o link público (token = null). ADMIN-only. */
export async function disablePublicQuadroLink(): Promise<{ ok: true }> {
  const { tenant } = await requireRole("ADMIN");
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { publicQuadroToken: null },
  });
  revalidatePath("/quadro");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";
import { getSessionStatus } from "@/server/wuzapi";

const schema = z.object({
  wuzapiUrl: z.string().url().nullable().or(z.literal("").transform(() => null)),
  wuzapiToken: z.string().max(500).nullable().or(z.literal("").transform(() => null)),
  followUpEnabled: z.boolean(),
});

export async function updateWuzapiConfig(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  await prisma.tenant.update({
    where: { id: tenant.id },
    data: {
      wuzapiUrl: parsed.data.wuzapiUrl ?? null,
      wuzapiToken: parsed.data.wuzapiToken ?? null,
      followUpEnabled: parsed.data.followUpEnabled,
    },
  });

  revalidatePath("/settings/wuzapi");
  return { ok: true };
}

/**
 * Bate em /session/status pra confirmar que a instância existe e o token
 * autoriza. Não persiste nada — só feedback pra UI antes de salvar.
 */
export async function testWuzapiConnection(
  input: unknown,
): Promise<
  | { ok: true; connected: boolean; raw: unknown }
  | { ok: false; error: string }
> {
  const inputSchema = z.object({
    wuzapiUrl: z.string().url(),
    wuzapiToken: z.string().min(1),
  });
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "URL e token são obrigatórios" };
  await requireRole("ADMIN");

  const result = await getSessionStatus({
    url: parsed.data.wuzapiUrl,
    token: parsed.data.wuzapiToken,
  });

  if (!result.ok) {
    return { ok: false, error: `[${result.kind}] ${result.message}` };
  }

  const connected =
    typeof result.data === "object" && result.data !== null
      ? Boolean(
          (result.data as { connected?: unknown }).connected ??
            (result.data as { loggedIn?: unknown }).loggedIn,
        )
      : false;

  return { ok: true, connected, raw: result.data };
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { importChatwootPage, type ImportPageSummary } from "@/server/chatwoot/import";
import { requireRole } from "@/server/tenant";

const inputSchema = z.object({
  page: z.number().int().min(1).max(10_000),
});

type ImportResult =
  | { ok: true; summary: ImportPageSummary }
  | { ok: false; error: string };

export async function runImportPage(input: unknown): Promise<ImportResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant } = await requireRole("ADMIN");

  // Lê credenciais do tenant — não passa do client pra evitar vazamento.
  const config = await prisma.tenant.findUnique({
    where: { id: tenant.id },
    select: {
      chatwootUrl: true,
      chatwootAccountId: true,
      chatwootApiToken: true,
    },
  });

  if (!config?.chatwootUrl || !config.chatwootAccountId || !config.chatwootApiToken) {
    return {
      ok: false,
      error:
        "Credenciais Chatwoot incompletas. Configure URL, Account ID e API token primeiro em /settings/chatwoot.",
    };
  }

  const result = await importChatwootPage(tenant.id, {
    url: config.chatwootUrl,
    accountId: config.chatwootAccountId,
    apiToken: config.chatwootApiToken,
  }, parsed.data.page);

  if ("error" in result) return { ok: false, error: result.error };

  revalidatePath("/kanban");
  return { ok: true, summary: result };
}

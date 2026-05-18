/**
 * Import histórico de contatos do Chatwoot.
 *
 * Diferente do webhook live (handlers.ts), este fluxo:
 *   - Roda sob demanda via UI (admin clica "Importar próxima página")
 *   - Decide o STAGE inicial baseado no status da conversa mais recente,
 *     não no "primeiro stage ativo do tenant"
 *   - NÃO dispara welcome sequence — esses contatos já têm conversa
 *     em andamento, não tem por que mandar "Oi, tudo bem?" agora
 *   - Adiciona tag "Importado Chatwoot" + sub-tag conforme status
 *
 * Idempotência: dedup por `(tenantId, chatwootContactId)` igual o webhook.
 * Rodar 2x atualiza em vez de duplicar.
 *
 * Paginação: 1 chamada = 1 página (15 contatos do Chatwoot) → 15 chamadas
 * adicionais pra buscar conversas. ~3-5s por click. UI mostra "X de Y".
 */
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import {
  type ChatwootContact,
  type ChatwootConversation,
  type ChatwootCredentials,
  listContactConversations,
  listContacts,
} from "./api";
import { channelToOrigin, fallbackContactName } from "./mapper";

// ──────────────────────────────────────────────────────────────────────────
// Decisão de stage + tags com base no histórico
// ──────────────────────────────────────────────────────────────────────────

type StageHint = {
  /** Nome do stage no tenant (precisa existir no seed). */
  stageName: string;
  tags: string[];
  notes: string;
};

/**
 * Mapeia status da conversa Chatwoot → stage do funil + tags.
 *
 *   open      → Potencial         (conversa ativa, lead em jogo)
 *   pending   → Novo Lead         (lead chegou mas atendente nem viu ainda)
 *   snoozed   → Nutrição          (atendente adiou — não é prioridade)
 *   resolved  → Nutrição          (encerrada; pode reaquecer no futuro)
 *   (sem conversa) → Novo Lead    (contato existe mas nunca falou)
 *
 * Tag "Importado Chatwoot" sempre presente, + sub-tag conforme decisão.
 */
export function decideStage(
  conversations: ChatwootConversation[],
  contactName: string | null | undefined,
): StageHint {
  const COMMON = "Importado Chatwoot";

  if (conversations.length === 0) {
    return {
      stageName: "Novo Lead",
      tags: [COMMON, "Sem conversa"],
      notes: `[Import Chatwoot] ${contactName ?? "contato"} sem conversa registrada.`,
    };
  }

  // Pega a conversa mais recente por last_activity_at (ou fallback pela ordem
  // que a API retornou — geralmente mais recente primeiro).
  const sorted = [...conversations].sort(
    (a, b) => (b.last_activity_at ?? 0) - (a.last_activity_at ?? 0),
  );
  const latest = sorted[0]!;
  const status = latest.status ?? "open";

  switch (status) {
    case "open":
      return {
        stageName: "Potencial",
        tags: [COMMON, "Conversa aberta"],
        notes: `[Import Chatwoot] Conversa #${latest.id} aberta.`,
      };
    case "pending":
      return {
        stageName: "Novo Lead",
        tags: [COMMON, "Conversa pendente"],
        notes: `[Import Chatwoot] Conversa #${latest.id} pendente — atendente ainda não viu.`,
      };
    case "snoozed":
      return {
        stageName: "Nutrição",
        tags: [COMMON, "Conversa snoozed"],
        notes: `[Import Chatwoot] Conversa #${latest.id} adiada pelo atendente.`,
      };
    case "resolved":
      return {
        stageName: "Nutrição",
        tags: [COMMON, "Conversa resolved"],
        notes: `[Import Chatwoot] Conversa #${latest.id} encerrada — pode reaquecer.`,
      };
    default:
      return {
        stageName: "Novo Lead",
        tags: [COMMON, `Status ${status}`],
        notes: `[Import Chatwoot] Conversa #${latest.id} status="${status}" (desconhecido).`,
      };
  }
}

export function pickInteractionDates(conversations: ChatwootConversation[]): {
  firstAt: Date;
  lastAt: Date;
} {
  const epochs = conversations
    .map((c) => c.last_activity_at)
    .filter((e): e is number => typeof e === "number" && e > 0);
  if (epochs.length === 0) {
    const now = new Date();
    return { firstAt: now, lastAt: now };
  }
  const min = Math.min(...epochs);
  const max = Math.max(...epochs);
  return { firstAt: new Date(min * 1000), lastAt: new Date(max * 1000) };
}

// ──────────────────────────────────────────────────────────────────────────
// Import de um único contato
// ──────────────────────────────────────────────────────────────────────────

type ImportContactResult =
  | { kind: "created"; leadId: string }
  | { kind: "updated"; leadId: string }
  | { kind: "skipped"; reason: string };

async function importContact(
  tenantId: string,
  contact: ChatwootContact,
  conversations: ChatwootConversation[],
  stageByName: Map<string, { id: string }>,
  importLabel: string | null,
): Promise<ImportContactResult> {
  const contactId = String(contact.id);

  // v1.1-U: filtro por label. Considera só conversas que carregam a label;
  // se sobrar zero, skipa o contato. Contatos sem nenhuma conversa também
  // skipam quando o filtro está ativo (não tem como inferir intenção).
  let effectiveConversations = conversations;
  if (importLabel) {
    const needle = importLabel.toLowerCase();
    effectiveConversations = conversations.filter((c) =>
      (c.labels ?? []).some((l) => l.toLowerCase() === needle),
    );
    if (effectiveConversations.length === 0) {
      return {
        kind: "skipped",
        reason: `nenhuma conversa com label "${importLabel}"`,
      };
    }
  }

  const hint = decideStage(effectiveConversations, contact.name);
  const stage = stageByName.get(hint.stageName);
  if (!stage) {
    return { kind: "skipped", reason: `Stage "${hint.stageName}" não existe no tenant` };
  }

  // Canal da conversa mais recente (se houver) determina o origin.
  const latestChannel =
    effectiveConversations[0]?.channel ??
    effectiveConversations[0]?.meta?.channel ??
    null;

  const { firstAt, lastAt } = pickInteractionDates(effectiveConversations);

  const existing = await prisma.lead.findFirst({
    where: { tenantId, chatwootContactId: contactId },
    select: { id: true, tags: true, stageId: true },
  });

  const baseData: Prisma.LeadUncheckedUpdateInput = {
    name: fallbackContactName(contact),
    phone: contact.phone_number ?? undefined,
    email: contact.email ?? undefined,
    chatwootContactId: contactId,
    chatwootConversationId: effectiveConversations[0]
      ? String(effectiveConversations[0].id)
      : null,
    chatwootInboxId:
      typeof effectiveConversations[0]?.inbox_id === "number"
        ? effectiveConversations[0]!.inbox_id
        : null,
    firstInteractionAt: firstAt,
    lastInteractionAt: lastAt,
  };

  if (existing) {
    // Já importado antes — só atualiza dados leves, NÃO mexe no stageId atual
    // (vendedora pode ter movido manualmente). Tags são mescladas pra não
    // perder o que foi adicionado depois.
    const mergedTags = Array.from(new Set([...existing.tags, ...hint.tags]));
    await prisma.lead.update({
      where: { id: existing.id },
      data: { ...baseData, tags: mergedTags },
    });
    return { kind: "updated", leadId: existing.id };
  }

  const created = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        tenantId,
        stageId: stage.id,
        name: fallbackContactName(contact),
        phone: contact.phone_number ?? null,
        email: contact.email ?? null,
        origin: channelToOrigin(latestChannel),
        tags: hint.tags,
        notes: hint.notes,
        chatwootContactId: contactId,
        chatwootConversationId: effectiveConversations[0]
          ? String(effectiveConversations[0].id)
          : null,
        chatwootInboxId:
          typeof effectiveConversations[0]?.inbox_id === "number"
            ? effectiveConversations[0]!.inbox_id
            : null,
        firstInteractionAt: firstAt,
        lastInteractionAt: lastAt,
      },
    });
    await tx.stageHistory.create({
      data: {
        leadId: lead.id,
        toStageId: stage.id,
        notes: `Lead importado do Chatwoot (status conversa: ${effectiveConversations[0]?.status ?? "sem conversa"})`,
      },
    });
    return lead;
  });

  // PROPOSITALMENTE não chamamos enqueueWelcomeSequence aqui — esses contatos
  // já têm conversa em andamento, não faz sentido reiniciar a cadência.

  return { kind: "created", leadId: created.id };
}

// ──────────────────────────────────────────────────────────────────────────
// Import de uma página (15 contatos por default no Chatwoot)
// ──────────────────────────────────────────────────────────────────────────

export type ImportPageSummary = {
  page: number;
  totalInChatwoot: number;
  contactsOnPage: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  /** True se essa página foi a última (próxima página seria vazia). */
  isLastPage: boolean;
};

const PAGE_SIZE = 15; // default do Chatwoot

export async function importChatwootPage(
  tenantId: string,
  credentials: ChatwootCredentials,
  page: number,
): Promise<ImportPageSummary | { error: string }> {
  const [stages, tenant] = await Promise.all([
    prisma.stage.findMany({
      where: { tenantId, active: true },
      select: { id: true, name: true },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { chatwootImportLabel: true },
    }),
  ]);
  const stageByName = new Map(stages.map((s) => [s.name, s]));
  const importLabel = tenant?.chatwootImportLabel?.trim() || null;

  const result = await listContacts(credentials, page);
  if (!result.ok) {
    return { error: `Falha listando contatos: [${result.kind}] ${result.message}` };
  }

  const summary: ImportPageSummary = {
    page,
    totalInChatwoot: result.data.meta.count,
    contactsOnPage: result.data.contacts.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    isLastPage:
      result.data.contacts.length === 0 ||
      page * PAGE_SIZE >= result.data.meta.count,
  };

  for (const contact of result.data.contacts) {
    let conversations: ChatwootConversation[] = [];
    const convResult = await listContactConversations(credentials, contact.id);
    if (convResult.ok) {
      conversations = convResult.data;
    } else {
      summary.errors.push(
        `Contato #${contact.id}: falha listando conversas (${convResult.message})`,
      );
      // Segue mesmo assim — importa sem conversas (vai cair em "Sem conversa")
    }

    try {
      const out = await importContact(tenantId, contact, conversations, stageByName, importLabel);
      if (out.kind === "created") summary.created++;
      else if (out.kind === "updated") summary.updated++;
      else {
        summary.skipped++;
        summary.errors.push(`Contato #${contact.id}: ${out.reason}`);
      }
    } catch (err) {
      summary.skipped++;
      const msg = err instanceof Error ? err.message : String(err);
      summary.errors.push(`Contato #${contact.id}: ${msg}`);
    }
  }

  return summary;
}

/**
 * Handler do webhook do plugin de Kanban do Chatwoot (v1.1-V).
 *
 * Fluxo:
 *   1. Recebe evento `kanban.item.created` (vendedora puxou conversa pro kanban)
 *   2. Payload só traz conversation_id — busca a conversa via API REST do
 *      Chatwoot pra extrair `meta.sender` (contato)
 *   3. Reaproveita `upsertLeadFromContact` (idempotente por chatwootContactId)
 *
 * Diferenças do webhook nativo:
 *   - NÃO aplica filtro por label (v1.1-U) — vendedora puxar pro kanban
 *     já é classificação explícita; label é redundante aqui.
 *   - NÃO precisa de stage inicial customizado: o `upsertLeadFromContact`
 *     usa o primeiro stage ativo do tenant (Novo Lead).
 *
 * Dedup com o webhook nativo: ambos usam (tenantId, chatwootContactId) como
 * chave única. Item criado no kanban DEPOIS que a conversa já gerou lead
 * via webhook nativo = no-op (só atualiza dados leves).
 */
import { prisma } from "@/lib/prisma";

import { getConversation, type ChatwootCredentials } from "./api";
import { upsertLeadFromContact, type HandlerResult } from "./handlers";
import type { KanbanItemCreatedEvent } from "./kanban-types";
import { normalizeId } from "./mapper";

export async function handleKanbanItemCreated(
  tenantId: string,
  event: KanbanItemCreatedEvent,
): Promise<HandlerResult> {
  // Account ID do payload deve bater com o do tenant (anti-cross-tenant).
  // Buscamos credenciais aqui (não passamos como param) pra deixar o caller
  // — a route — agnóstico ao schema.
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      chatwootUrl: true,
      chatwootAccountId: true,
      chatwootApiToken: true,
    },
  });

  if (
    !tenant?.chatwootUrl ||
    !tenant.chatwootAccountId ||
    !tenant.chatwootApiToken
  ) {
    return { kind: "skipped", reason: "tenant sem credenciais Chatwoot configuradas" };
  }

  if (tenant.chatwootAccountId !== event.data.account_id) {
    return {
      kind: "skipped",
      reason: `account_id do payload (${event.data.account_id}) não bate com tenant (${tenant.chatwootAccountId})`,
    };
  }

  const displayId =
    event.data.item.conversation_display_id ??
    event.data.item.item_details?.conversation_id ??
    null;
  if (!displayId) {
    return { kind: "skipped", reason: "item sem conversation_id" };
  }

  const credentials: ChatwootCredentials = {
    url: tenant.chatwootUrl,
    accountId: tenant.chatwootAccountId,
    apiToken: tenant.chatwootApiToken,
  };

  const convResult = await getConversation(credentials, displayId);
  if (!convResult.ok) {
    return {
      kind: "skipped",
      reason: `falha buscando conversa #${displayId}: [${convResult.kind}] ${convResult.message}`,
    };
  }

  const sender = convResult.data.meta?.sender;
  const contactId = normalizeId(sender?.id);
  if (!sender || !contactId) {
    return {
      kind: "skipped",
      reason: `conversa #${displayId} sem meta.sender — Chatwoot pode estar com contato anônimo`,
    };
  }

  return upsertLeadFromContact({
    tenantId,
    contact: {
      id: contactId,
      name: sender.name ?? null,
      email: sender.email ?? null,
      phone_number: sender.phone_number ?? null,
      identifier: sender.identifier ?? null,
    },
    channel:
      (typeof convResult.data.channel === "string" ? convResult.data.channel : null) ??
      (typeof convResult.data.meta?.channel === "string" ? convResult.data.meta.channel : null),
    conversationId: String(displayId),
    inboxId:
      typeof convResult.data.inbox_id === "number" ? convResult.data.inbox_id : null,
  });
}

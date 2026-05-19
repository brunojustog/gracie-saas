/**
 * Cliente HTTP da API REST do Chatwoot.
 *
 * Auth: header `api_access_token: <valor>` (token salvo em
 * `Tenant.chatwootApiToken`). NÃO é Bearer.
 *
 * Endpoints que usamos no import histórico:
 *   GET /api/v1/accounts/{account_id}/contacts?page=N
 *   GET /api/v1/accounts/{account_id}/contacts/{id}/conversations
 *
 * Referência: https://www.chatwoot.com/developers/api/
 */

export type ChatwootCredentials = {
  url: string;        // ex: https://chat.simplificaonline.site
  accountId: number;
  apiToken: string;
};

export type ChatwootApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; kind: "network" | "auth" | "client" | "server"; status?: number; message: string };

function urlOf(base: string, path: string): string {
  const cleanBase = base.replace(/\/+$/, "");
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  return `${cleanBase}${cleanPath}`;
}

function classifyError(status: number): "auth" | "client" | "server" {
  if (status === 401 || status === 403) return "auth";
  if (status >= 400 && status < 500) return "client";
  return "server";
}

async function call<T = unknown>(
  creds: ChatwootCredentials,
  path: string,
): Promise<ChatwootApiResult<T>> {
  if (!creds.url || !creds.apiToken || !creds.accountId) {
    return { ok: false, kind: "auth", message: "Credenciais Chatwoot ausentes" };
  }

  let response: Response;
  try {
    response = await fetch(urlOf(creds.url, path), {
      method: "GET",
      headers: {
        "content-type": "application/json",
        api_access_token: creds.apiToken,
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro de rede";
    return { ok: false, kind: "network", message };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : null) ?? `HTTP ${response.status}`;
    return {
      ok: false,
      kind: classifyError(response.status),
      status: response.status,
      message,
    };
  }

  return { ok: true, data: payload as T };
}

// ──────────────────────────────────────────────────────────────────────────
// Contacts
// ──────────────────────────────────────────────────────────────────────────

export type ChatwootContact = {
  id: number;
  name?: string | null;
  email?: string | null;
  phone_number?: string | null;
  identifier?: string | null;
  /** Última atividade do contato (epoch seconds). */
  last_activity_at?: number | null;
  /** Pode vir como meta extra; raramente útil. */
  [key: string]: unknown;
};

export type ChatwootContactsPage = {
  contacts: ChatwootContact[];
  meta: {
    count: number;        // total absoluto no Chatwoot
    current_page: number;
    /** Páginas têm 15 contatos por default. */
  };
};

export async function listContacts(
  creds: ChatwootCredentials,
  page: number,
): Promise<ChatwootApiResult<ChatwootContactsPage>> {
  const result = await call<{
    payload: ChatwootContact[];
    meta: { count: number; current_page: number };
  }>(creds, `/api/v1/accounts/${creds.accountId}/contacts?page=${page}&sort=last_activity_at`);

  if (!result.ok) return result;

  return {
    ok: true,
    data: {
      contacts: result.data.payload ?? [],
      meta: {
        count: result.data.meta?.count ?? 0,
        current_page: result.data.meta?.current_page ?? page,
      },
    },
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Conversations
// ──────────────────────────────────────────────────────────────────────────

export type ChatwootConversation = {
  id: number;
  status?: "open" | "resolved" | "pending" | "snoozed" | string;
  inbox_id?: number;
  /** Epoch seconds da última mensagem. */
  last_activity_at?: number | null;
  /** Canal usado nessa conversa — discutível, às vezes vem só no inbox. */
  channel?: string | null;
  /**
   * Labels da conversa (v1.1-U). A API REST retorna como `labels` no payload
   * de `/contacts/{id}/conversations`. Algumas versões do Chatwoot mandam só
   * pelo endpoint dedicado `/conversations/{id}/labels` — se vier vazio
   * mesmo havendo label, o usuário precisa atualizar.
   */
  labels?: string[];
  messages?: ChatwootMessage[];
  meta?: {
    channel?: string | null;
    sender?: { id?: number; name?: string };
  };
  [key: string]: unknown;
};

export type ChatwootMessage = {
  id: number;
  /** 0=incoming (contato → agente), 1=outgoing (agente → contato), 2=activity, 3=template. */
  message_type?: number;
  content?: string | null;
  created_at?: number | null;
  [key: string]: unknown;
};

export async function listContactConversations(
  creds: ChatwootCredentials,
  contactId: number,
): Promise<ChatwootApiResult<ChatwootConversation[]>> {
  const result = await call<{ payload: ChatwootConversation[] }>(
    creds,
    `/api/v1/accounts/${creds.accountId}/contacts/${contactId}/conversations`,
  );
  if (!result.ok) return result;
  return { ok: true, data: result.data.payload ?? [] };
}

/**
 * Detalhe completo de UMA conversa, incluindo `meta.sender` (contato).
 * Usado pelo webhook do kanban (v1.1-V) que recebe só `conversation_id`
 * no payload — buscamos o contato aqui pra criar o lead.
 *
 * O Chatwoot usa `display_id` no path quando dentro do scope da account.
 */
export type ChatwootConversationDetail = ChatwootConversation & {
  meta?: ChatwootConversation["meta"] & {
    sender?: {
      id?: number;
      name?: string | null;
      email?: string | null;
      phone_number?: string | null;
      identifier?: string | null;
    };
  };
};

export async function getConversation(
  creds: ChatwootCredentials,
  conversationDisplayId: number | string,
): Promise<ChatwootApiResult<ChatwootConversationDetail>> {
  return call<ChatwootConversationDetail>(
    creds,
    `/api/v1/accounts/${creds.accountId}/conversations/${conversationDisplayId}`,
  );
}

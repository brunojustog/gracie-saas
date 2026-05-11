/**
 * Cliente HTTP da Wuzapi (https://github.com/asternic/wuzapi e variantes).
 *
 * Auth: header puro `token: <valor>` (NÃO Bearer, NÃO Basic). Cada tenant tem
 * sua própria instância Wuzapi com token próprio — credenciais vêm do
 * `Tenant.wuzapiUrl` / `Tenant.wuzapiToken`.
 *
 * Endpoints que usamos:
 *   - POST /chat/send/text   — manda mensagem de texto
 *   - GET  /session/status   — healthcheck (instância conectada ao WhatsApp?)
 *
 * Erros são tipados pra o caller distinguir entre falha de rede (retry futuro)
 * e erro permanente (4xx — provavelmente token errado ou número inválido).
 */

export type WuzapiCredentials = {
  url: string;
  token: string;
};

export type SendTextInput = {
  phone: string;
  body: string;
  /** Delay em ms antes do envio (default da Wuzapi). 1500 simula "digitando". */
  delayMs?: number;
  linkPreview?: boolean;
};

export type WuzapiResult<T> =
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
  creds: WuzapiCredentials,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<WuzapiResult<T>> {
  if (!creds.url || !creds.token) {
    return { ok: false, kind: "auth", message: "Credenciais Wuzapi ausentes" };
  }

  let response: Response;
  try {
    response = await fetch(urlOf(creds.url, path), {
      method,
      headers: {
        "content-type": "application/json",
        token: creds.token,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      // Timeout via AbortSignal — fetch espera indef sem isso.
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "erro de rede";
    return { ok: false, kind: "network", message };
  }

  // Wuzapi às vezes retorna JSON mesmo em erro; tentamos parsear pra mensagem.
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
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
// Operações
// ──────────────────────────────────────────────────────────────────────────

/**
 * Normaliza o telefone pro formato esperado pela Wuzapi: só dígitos com DDI 55.
 * Aceita "(11) 99999-9999", "+5511999999999", "11999999999" → "5511999999999".
 */
export function toWuzapiPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  // Brasileiros: 10 ou 11 dígitos (DDD + número) → prefixa 55.
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

export async function sendText(
  creds: WuzapiCredentials,
  input: SendTextInput,
): Promise<WuzapiResult<{ id?: string }>> {
  return call(creds, "POST", "/chat/send/text", {
    phone: toWuzapiPhone(input.phone),
    body: input.body,
    delay: input.delayMs ?? 1500,
    linkPreview: input.linkPreview ?? true,
    mentionAll: false,
  });
}

export type SessionStatus = {
  connected?: boolean;
  loggedIn?: boolean;
  /** Wuzapi varia o nome — guardamos como unknown e a UI mostra raw. */
  [key: string]: unknown;
};

export async function getSessionStatus(
  creds: WuzapiCredentials,
): Promise<WuzapiResult<SessionStatus>> {
  return call<SessionStatus>(creds, "GET", "/session/status");
}

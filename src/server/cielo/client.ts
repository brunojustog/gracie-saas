/**
 * Cliente HTTP da Cielo E-commerce API 3.0 (v1.3-A).
 *
 * NODE-ONLY. Sem SDK — fetch puro, mesmo estilo do `wuzapi.ts`: toda função
 * devolve `CieloResult<T>` (nunca lança por erro HTTP), pro caller decidir.
 *
 * Validado contra o sandbox em 11/11/2026:
 *   - POST /1/sales com RecurrentPayment + CreditCard.CardToken (sem CVV) ✔
 *   - AuthorizeNow=false + StartDate → Status 20 (agendada) ✔
 *   - Sem `Capture: true` a 1ª cobrança fica só AUTORIZADA (Status 1) —
 *     por isso sempre mandamos Capture=true.
 *   - PUT .../Amount e .../RecurrencyDay aceitam o valor CRU no body ("26000") ✔
 *   - PUT .../Deactivate sem body → Status da recorrência vira 3 ✔
 *
 * Docs: https://docs.cielo.com.br/ecommerce-cielo/v3.0-en/reference/
 */

export type CieloEnvironment = "sandbox" | "production";

export type CieloCredentials = {
  environment: CieloEnvironment;
  merchantId: string;
  merchantKey: string;
};

export const CIELO_HOSTS: Record<
  CieloEnvironment,
  { api: string; query: string; oauth: string; sopToken: string; sopScript: string }
> = {
  sandbox: {
    api: "https://apisandbox.cieloecommerce.cielo.com.br",
    query: "https://apiquerysandbox.cieloecommerce.cielo.com.br",
    oauth: "https://authsandbox.braspag.com.br/oauth2/token",
    sopToken: "https://transactionsandbox.pagador.com.br/post/api/public/v2/accesstoken",
    sopScript: "https://transactionsandbox.pagador.com.br/post/Scripts/silentorderpost-1.0.min.js",
  },
  production: {
    api: "https://api.cieloecommerce.cielo.com.br",
    query: "https://apiquery.cieloecommerce.cielo.com.br",
    oauth: "https://auth.braspag.com.br/oauth2/token",
    // A doc nova e o exemplo oficial (github.com/Braspag/silent-order-post)
    // divergem no host de produção do SOP — usamos o do exemplo oficial.
    // CONFIRMAR com a Cielo ao ativar produção.
    sopToken: "https://www.pagador.com.br/post/api/public/v2/accesstoken",
    sopScript: "https://transactionscus.pagador.com.br/post/Scripts/silentorderpost-1.0.min.js",
  },
};

export type CieloResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; raw?: unknown };

/** Status do pagamento (Payment.Status). */
export const PAYMENT_STATUS = {
  NotFinished: 0,
  Authorized: 1,
  PaymentConfirmed: 2,
  Denied: 3,
  Voided: 10,
  Refunded: 11,
  Pending: 12,
  Aborted: 13,
  Scheduled: 20,
} as const;

/** Status da recorrência (RecurrentPayment.Status). */
export const RECURRENCE_STATUS_LABEL: Record<number, string> = {
  1: "ativa",
  2: "finalizada",
  3: "desativada",
  4: "desativada (tentativas esgotadas)",
  5: "desativada (cartão vencido)",
  8: "desativada (bloqueio da loja)",
};

export type CieloSale = {
  MerchantOrderId: string;
  Payment: {
    PaymentId?: string;
    Status: number;
    Amount: number;
    CapturedAmount?: number;
    ReturnCode?: string;
    ReturnMessage?: string;
    ReceivedDate?: string;
    CapturedDate?: string;
    CreditCard?: { CardNumber?: string; Brand?: string };
    RecurrentPayment?: {
      RecurrentPaymentId: string;
      NextRecurrency?: string;
      ReasonCode?: number;
      ReasonMessage?: string;
    };
  };
};

export type CieloRecurrence = {
  RecurrentPayment: {
    RecurrentPaymentId: string;
    NextRecurrency?: string;
    Amount: number;
    RecurrencyDay?: number;
    Status: number;
    SuccessfulRecurrences?: number;
    RecurrentTransactions?: Array<{ PaymentId: string; PaymentNumber?: number; TryNumber?: number }>;
  };
};

const TIMEOUT_MS = 20_000;

async function request<T>(
  creds: CieloCredentials,
  method: "GET" | "POST" | "PUT",
  host: "api" | "query",
  path: string,
  body?: unknown,
): Promise<CieloResult<T>> {
  const base = CIELO_HOSTS[creds.environment][host];
  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        MerchantId: creds.merchantId,
        MerchantKey: creds.merchantKey,
      },
      body:
        body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (e) {
    return { ok: false, status: 0, message: `falha de rede: ${e instanceof Error ? e.message : String(e)}` };
  }

  const text = await res.text();
  let json: unknown = undefined;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  if (!res.ok) {
    return { ok: false, status: res.status, message: describeError(json, res.status), raw: json };
  }
  return { ok: true, data: json as T };
}

/** A Cielo devolve erro como `[{Code, Message}]` ou texto cru. */
export function describeError(raw: unknown, status: number): string {
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .map((e) =>
        typeof e === "object" && e !== null
          ? `${(e as { Code?: unknown }).Code ?? "?"}: ${(e as { Message?: unknown }).Message ?? ""}`
          : String(e),
      )
      .join("; ");
  }
  if (typeof raw === "string" && raw.trim()) return raw.trim().slice(0, 300);
  if (status === 401) return "credenciais inválidas (MerchantId/MerchantKey)";
  return `HTTP ${status}`;
}

export type CreateRecurrenceInput = {
  merchantOrderId: string;
  customerName: string;
  amountCents: number;
  /** true = cobra a 1ª mensalidade agora; false = agenda em `startDate`. */
  authorizeNow: boolean;
  /** YYYY-MM-DD — obrigatório quando authorizeNow=false. */
  startDate?: string;
  cardToken: string;
  brand: string;
  softDescriptor?: string;
};

/** Corpo do POST /1/sales/ (puro — testado em unit test). */
export function buildRecurrenceBody(input: CreateRecurrenceInput) {
  return {
    MerchantOrderId: input.merchantOrderId,
    Customer: { Name: input.customerName },
    Payment: {
      Type: "CreditCard",
      Amount: input.amountCents,
      Installments: 1,
      Capture: true,
      ...(input.softDescriptor ? { SoftDescriptor: input.softDescriptor } : {}),
      RecurrentPayment: {
        AuthorizeNow: input.authorizeNow,
        ...(input.authorizeNow ? {} : { StartDate: input.startDate }),
        Interval: "Monthly",
      },
      CreditCard: { CardToken: input.cardToken, Brand: input.brand },
    },
  };
}

export function createRecurrence(creds: CieloCredentials, input: CreateRecurrenceInput) {
  return request<CieloSale>(creds, "POST", "api", "/1/sales/", buildRecurrenceBody(input));
}

export function getSale(creds: CieloCredentials, paymentId: string) {
  return request<CieloSale>(creds, "GET", "query", `/1/sales/${encodeURIComponent(paymentId)}`);
}

export function getRecurrence(creds: CieloCredentials, recurrentPaymentId: string) {
  return request<CieloRecurrence>(
    creds,
    "GET",
    "query",
    `/1/RecurrentPayment/${encodeURIComponent(recurrentPaymentId)}`,
  );
}

export function deactivateRecurrence(creds: CieloCredentials, recurrentPaymentId: string) {
  return request<unknown>(
    creds,
    "PUT",
    "api",
    `/1/RecurrentPayment/${encodeURIComponent(recurrentPaymentId)}/Deactivate`,
  );
}

export function reactivateRecurrence(creds: CieloCredentials, recurrentPaymentId: string) {
  return request<unknown>(
    creds,
    "PUT",
    "api",
    `/1/RecurrentPayment/${encodeURIComponent(recurrentPaymentId)}/Reactivate`,
  );
}

export function updateRecurrenceAmount(
  creds: CieloCredentials,
  recurrentPaymentId: string,
  amountCents: number,
) {
  return request<unknown>(
    creds,
    "PUT",
    "api",
    `/1/RecurrentPayment/${encodeURIComponent(recurrentPaymentId)}/Amount`,
    String(amountCents),
  );
}

/**
 * SÓ SANDBOX: tokeniza o cartão no servidor (POST /1/card/). Em produção o
 * cartão é tokenizado no navegador via Silent Order Post — o número nunca
 * chega aqui. Existe porque a conta de sandbox da Cielo não vem com
 * credencial de SOP, então sem isso não dá pra testar o fluxo ponta a ponta.
 */
export function sandboxTokenizeCard(
  creds: CieloCredentials,
  card: { number: string; holder: string; expiration: string; brand: string },
) {
  if (creds.environment !== "sandbox") {
    return Promise.resolve<CieloResult<{ CardToken: string }>>({
      ok: false,
      status: 0,
      message: "tokenização no servidor só é permitida no sandbox",
    });
  }
  return request<{ CardToken: string }>(creds, "POST", "api", "/1/card/", {
    CustomerName: card.holder,
    CardNumber: card.number,
    Holder: card.holder,
    ExpirationDate: card.expiration,
    Brand: card.brand,
  });
}

/**
 * Silent Order Post: OAuth (ClientId/Secret) → AccessToken de uso único
 * (~20 min) que o script do navegador usa pra tokenizar o cartão.
 */
export async function getSopAccessToken(params: {
  environment: CieloEnvironment;
  merchantId: string;
  clientId: string;
  clientSecret: string;
}): Promise<CieloResult<{ accessToken: string; scriptUrl: string }>> {
  const hosts = CIELO_HOSTS[params.environment];
  try {
    const basic = Buffer.from(`${params.clientId}:${params.clientSecret}`).toString("base64");
    const oauth = await fetch(hosts.oauth, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const oauthJson = (await oauth.json().catch(() => ({}))) as { access_token?: string };
    if (!oauth.ok || !oauthJson.access_token) {
      return { ok: false, status: oauth.status, message: "falha no OAuth do Silent Order Post (ClientId/Secret)" };
    }
    const sop = await fetch(hosts.sopToken, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        MerchantId: params.merchantId,
        Authorization: `Bearer ${oauthJson.access_token}`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const sopJson = (await sop.json().catch(() => ({}))) as { AccessToken?: string };
    if (!sop.ok || !sopJson.AccessToken) {
      return { ok: false, status: sop.status, message: "falha ao obter AccessToken do Silent Order Post" };
    }
    return { ok: true, data: { accessToken: sopJson.AccessToken, scriptUrl: hosts.sopScript } };
  } catch (e) {
    return { ok: false, status: 0, message: `falha de rede: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * Cron endpoint: envia o resumo diário do Quadro no WhatsApp (v1.1-BH).
 *
 * Trigger externo (crontab do host) às 22h America/Sao_Paulo (= 01:00 UTC):
 *   curl "https://app.gbanaliafranco.com.br/api/cron/daily-quadro?secret=$CRON_SECRET"
 *
 * Auth: `CRON_SECRET` env var (mesma do /api/cron/followup). Sem secret → 503.
 */
import { type NextRequest, NextResponse } from "next/server";

import { sendDailyQuadroReports } from "@/server/daily-report";

export const dynamic = "force-dynamic";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function authenticate(
  req: NextRequest,
): { ok: true } | { ok: false; response: NextResponse } {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "CRON_SECRET não configurado no servidor" },
        { status: 503 },
      ),
    };
  }
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const queryParam = req.nextUrl.searchParams.get("secret") ?? "";
  const provided = bearer || queryParam;
  if (!provided || !timingSafeEqual(provided, expected)) {
    return {
      ok: false,
      response: NextResponse.json({ error: "unauthorized" }, { status: 401 }),
    };
  }
  return { ok: true };
}

export async function GET(req: NextRequest) {
  const auth = authenticate(req);
  if (!auth.ok) return auth.response;

  try {
    const summary = await sendDailyQuadroReports();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron/daily-quadro] erro", err);
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const POST = GET;

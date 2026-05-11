/**
 * Cron endpoint: processa jobs de follow-up pendentes.
 *
 * Configurar trigger externo (Portainer cron, cron-job.org, etc) chamando
 * a cada 30-60 min:
 *
 *   curl -H "Authorization: Bearer $CRON_SECRET" https://gracie.../api/cron/followup
 *
 * Ou via query param (compatível com serviços que não permitem header custom):
 *
 *   curl "https://gracie.../api/cron/followup?secret=$CRON_SECRET"
 *
 * Autenticação: `CRON_SECRET` env var. Sem secret configurado, rota responde 503
 * (deploy mal configurado é seguro — vale mais que rota aberta).
 */
import { type NextRequest, NextResponse } from "next/server";

import { processDueJobs } from "@/server/followup";

export const dynamic = "force-dynamic";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function authenticate(req: NextRequest): { ok: true } | { ok: false; response: NextResponse } {
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
    const summary = await processDueJobs();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron/followup] erro", err);
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

// Permitir POST também — alguns serviços de cron preferem.
export const POST = GET;

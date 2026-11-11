/**
 * Cron endpoint: concilia as recorrências Cielo ativas (v1.3-A).
 *
 * Rede de segurança do webhook: consulta cada recorrência ativa na Cielo e dá
 * baixa em qualquer mensalidade paga que ainda não tenha PaymentRecord
 * (idempotente). Sugestão: rodar 1x por dia de manhã.
 *
 * Auth: `CRON_SECRET` (Bearer ou ?secret), igual aos outros crons.
 */
import { type NextRequest, NextResponse } from "next/server";

import { reconcileAllCielo } from "@/server/cielo/recurrence";

export const dynamic = "force-dynamic";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "CRON_SECRET não configurado no servidor" }, { status: 503 });
  }
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const provided = bearer || (req.nextUrl.searchParams.get("secret") ?? "");
  if (!provided || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await reconcileAllCielo();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("[cron/cielo-reconcile] erro", err);
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const POST = GET;

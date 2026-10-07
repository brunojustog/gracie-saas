/**
 * Cron endpoint: gera os ciclos de recorrência das aulas particulares (v1.2-CA).
 *
 * Só roda `runPrivateRecurrence` (NÃO envia o resumo do WhatsApp). Útil pra
 * rodar sob demanda (backfill imediato) sem disparar o quadro diário. O
 * daily-quadro das 22h também chama a recorrência — este é um gatilho avulso.
 *
 * Auth: `CRON_SECRET` (Bearer ou ?secret), igual aos outros crons.
 */
import { type NextRequest, NextResponse } from "next/server";

import { runPrivateRecurrence } from "@/server/private-packages";

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
    return NextResponse.json(
      { error: "CRON_SECRET não configurado no servidor" },
      { status: 503 },
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const provided = bearer || (req.nextUrl.searchParams.get("secret") ?? "");
  if (!provided || !timingSafeEqual(provided, expected)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await runPrivateRecurrence();
    return NextResponse.json({ ok: true, recurrence: result });
  } catch (err) {
    console.error("[cron/private-recurrence] erro", err);
    const message = err instanceof Error ? err.message : "erro desconhecido";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

export const POST = GET;

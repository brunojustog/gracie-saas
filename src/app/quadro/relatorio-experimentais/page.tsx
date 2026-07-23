import Link from "next/link";

import {
  type PeriodPreset,
  resolveCustom,
  resolvePreset,
} from "@/lib/period";
import { getExperimentalReport } from "@/server/quadro";
import { requireRole } from "@/server/tenant";

import { PrintButton } from "./print-button";

const VALID_PRESETS: PeriodPreset[] = [
  "this_month",
  "last_month",
  "last_7_days",
  "last_30_days",
];

type SearchParams = Promise<{ period?: string; from?: string; to?: string }>;

/**
 * Relatório de leads experimentais (v1.1-BX) — a lista Data · Nome · Estágio ·
 * Motivo que o Anderson montava à mão. Gerada a partir do botão no Quadro,
 * respeitando o mesmo período. Layout limpo pra imprimir / salvar PDF.
 */
export default async function RelatorioExperimentaisPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant } = await requireRole("ADMIN");
  const sp = await searchParams;

  const custom = sp.from && sp.to ? resolveCustom(sp.from, sp.to) : null;
  const preset: PeriodPreset = VALID_PRESETS.includes(sp.period as PeriodPreset)
    ? (sp.period as PeriodPreset)
    : "this_month";
  const period = custom ?? resolvePreset(preset);

  const { rows, generatedAt } = await getExperimentalReport(
    tenant.id,
    period.from,
    period.to,
  );

  const backHref = `/quadro?${new URLSearchParams(
    custom ? { from: sp.from!, to: sp.to! } : { period: preset },
  ).toString()}`;

  const STAGE_TONE: Record<string, string> = {
    Ganho: "bg-emerald-100 text-emerald-800",
    Negociação: "bg-sky-100 text-sky-800",
    Nutrição: "bg-amber-100 text-amber-800",
    Perda: "bg-red-100 text-red-800",
  };

  return (
    <main className="mx-auto max-w-4xl px-6 py-8 text-zinc-900">
      {/* Barra de ações — some na impressão */}
      <div className="mb-6 flex items-center justify-between gap-2 print:hidden">
        <Link
          href={backHref}
          className="text-sm text-zinc-500 underline-offset-2 hover:underline"
        >
          ← Voltar ao Quadro
        </Link>
        <PrintButton />
      </div>

      <header className="mb-5 border-b pb-4">
        <h1 className="text-xl font-bold">Relatório de leads experimentais</h1>
        <p className="mt-1 text-sm text-zinc-600">
          {tenant.name} · Período: <strong>{period.label}</strong> ·{" "}
          {rows.length} lead{rows.length === 1 ? "" : "s"} que compareceram
        </p>
        <p className="mt-0.5 text-xs text-zinc-400">
          Gerado em {generatedAt.toLocaleString("pt-BR")}
        </p>
      </header>

      {rows.length === 0 ? (
        <p className="text-sm text-zinc-500">
          Nenhum lead compareceu a uma aula experimental neste período.
        </p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-zinc-500">
              <th className="py-2 pr-3 font-medium">Data da aula</th>
              <th className="py-2 pr-3 font-medium">Nome</th>
              <th className="py-2 pr-3 font-medium">Estágio</th>
              <th className="py-2 font-medium">Motivo / Observação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.leadId} className="border-b align-top">
                <td className="whitespace-nowrap py-2 pr-3 text-zinc-600">
                  {r.dates}
                </td>
                <td className="py-2 pr-3 font-medium">{r.name}</td>
                <td className="py-2 pr-3">
                  <span
                    className={`inline-block rounded-full px-2 py-0.5 text-xs ${
                      STAGE_TONE[r.stage] ?? "bg-zinc-100 text-zinc-700"
                    }`}
                  >
                    {r.stage}
                  </span>
                </td>
                <td className="py-2 text-zinc-700">
                  {r.motivo || (
                    <span className="text-zinc-300">— sem registro —</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <p className="mt-6 text-xs text-zinc-400 print:hidden">
        O &quot;motivo&quot; vem do comentário obrigatório registrado quando o
        lead sai do comparecimento. Para leads antigos (antes dessa
        obrigatoriedade) pode aparecer &quot;sem registro&quot; — os novos já
        vêm preenchidos.
      </p>
    </main>
  );
}

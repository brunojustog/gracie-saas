import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import type { ProfCalEntry, getProfessorReport } from "@/server/professor-classes";

import { ProfessorCalendar } from "../professor-calendar";
import { Pie, PIE_COLORS } from "../pie";

type Report = Awaited<ReturnType<typeof getProfessorReport>>;

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dayFull = (iso: string) =>
  format(new Date(`${iso}T12:00:00`), "EEE dd/MM", { locale: ptBR });

/**
 * Bloco de relatório de UM professor (v1.2-AB) — reutilizado no relatório
 * individual e no relatório geral (todos os professores). Sempre imprimível:
 * `break-inside-avoid` evita cortar o bloco entre páginas.
 */
export function ReportBlock({
  professorName,
  report,
  calendar,
  from,
  to,
  showName = false,
}: {
  professorName: string;
  report: Report;
  calendar: { byDay: Record<string, ProfCalEntry[]>; totalCount: number };
  from: Date;
  to: Date;
  showName?: boolean;
}) {
  return (
    <div className="space-y-5">
      {showName ? (
        <h2 className="border-b pb-1 text-lg font-bold">{professorName}</h2>
      ) : null}

      {/* Total + pizza */}
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-muted-foreground">
              Total geral a pagar
            </div>
            <div className="text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {brl(report.total)}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {report.totalAulas} aula{report.totalAulas === 1 ? "" : "s"} no período
            </div>
          </div>
          {report.byModality.length > 0 ? (
            <div className="flex items-center gap-3">
              <Pie slices={report.byModality.map((m) => ({ label: m.label, value: m.count }))} size={104} />
              <ul className="space-y-0.5 text-xs">
                {report.byModality.map((m, i) => (
                  <li key={m.label} className="flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span>{m.label}</span>
                    <span className="text-muted-foreground">{m.count}×</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </section>

      {/* Aulas por tipo */}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Aulas por tipo</h3>
        {report.categories.length === 0 ? (
          <p className="rounded-lg border bg-card p-4 text-center text-sm text-muted-foreground">
            Nenhuma aula confirmada no período.
          </p>
        ) : (
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase text-muted-foreground">
                <th className="py-1.5 font-medium">Tipo</th>
                <th className="py-1.5 text-right font-medium">Qtd</th>
                <th className="py-1.5 text-right font-medium">Valor</th>
              </tr>
            </thead>
            <tbody>
              {report.categories.map((c) => (
                <tr key={c.key} className="border-b">
                  <td className="py-1.5">{c.label}</td>
                  <td className="py-1.5 text-right tabular-nums">{c.count}</td>
                  <td className="py-1.5 text-right tabular-nums">{brl(c.valor)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-1.5">Total</td>
                <td className="py-1.5 text-right tabular-nums">{report.totalAulas}</td>
                <td className="py-1.5 text-right tabular-nums text-emerald-700 dark:text-emerald-300">
                  {brl(report.total)}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </section>

      {/* Particulares com nomes */}
      {report.particulars.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">
            Particulares ({report.particulars.length})
          </h3>
          <ul className="divide-y rounded-lg border">
            {report.particulars.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium">{p.nome}</span>
                {p.dateISO ? (
                  <span className="shrink-0 text-xs text-muted-foreground">{dayFull(p.dateISO)}</span>
                ) : null}
                <span className="shrink-0 tabular-nums text-muted-foreground">{brl(p.valor)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Dias com aula */}
      <section>
        <h3 className="mb-2 text-sm font-semibold">Dias com aula ({report.days.length})</h3>
        {report.days.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum dia com aula no período.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {report.days.map((d) => (
              <span
                key={d.dateISO}
                className="inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-xs"
              >
                {dayFull(d.dateISO)}
                <span className="text-muted-foreground">· {d.count}×</span>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Calendário das aulas */}
      <section className="break-inside-avoid rounded-xl border bg-card p-4">
        <h3 className="mb-2 text-sm font-semibold">
          Calendário das aulas ({calendar.totalCount})
        </h3>
        {calendar.totalCount === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma aula confirmada no período.</p>
        ) : (
          <ProfessorCalendar from={from} to={to} byDay={calendar.byDay} />
        )}
      </section>
    </div>
  );
}

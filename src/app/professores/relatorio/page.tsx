import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/prisma";
import {
  type PeriodPreset,
  resolveCustom,
  resolvePreset,
} from "@/lib/period";
import {
  getProfessorCalendar,
  getProfessorReport,
} from "@/server/professor-classes";
import { requireRole } from "@/server/tenant";

import { ProfessorCalendar } from "../professor-calendar";
import { PrintButton } from "./print-button";

const VALID_PRESETS: PeriodPreset[] = [
  "this_month",
  "last_month",
  "last_7_days",
  "last_30_days",
];

type SearchParams = Promise<{
  professor?: string;
  period?: string;
  from?: string;
  to?: string;
}>;

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dayFull = (iso: string) =>
  format(new Date(`${iso}T12:00:00`), "EEE dd/MM", { locale: ptBR });

export default async function ProfessorReportPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant } = await requireRole("ADMIN");
  const sp = await searchParams;

  const professorId = sp.professor;
  if (!professorId) notFound();

  const professor = await prisma.professor.findFirst({
    where: { id: professorId, tenantId: tenant.id },
    select: { name: true },
  });
  if (!professor) notFound();

  const custom = sp.from && sp.to ? resolveCustom(sp.from, sp.to) : null;
  const preset: PeriodPreset = VALID_PRESETS.includes(sp.period as PeriodPreset)
    ? (sp.period as PeriodPreset)
    : "this_month";
  const period = custom ?? resolvePreset(preset);

  const [report, calendar] = await Promise.all([
    getProfessorReport(tenant.id, professorId, period.from, period.to),
    getProfessorCalendar(tenant.id, professorId, period.from, period.to),
  ]);

  const backHref = (() => {
    const q = new URLSearchParams();
    if (sp.period) q.set("period", sp.period);
    if (sp.from) q.set("from", sp.from);
    if (sp.to) q.set("to", sp.to);
    q.set("professor", professorId);
    return `/professores?${q.toString()}`;
  })();

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 print:max-w-none print:px-0 print:py-0">
      {/* Barra de ações — não sai na impressão */}
      <div className="flex items-center justify-between gap-2 print:hidden">
        <Link
          href={backHref}
          className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium hover:bg-accent"
        >
          <ChevronLeft className="h-4 w-4" /> Voltar
        </Link>
        <PrintButton />
      </div>

      {/* Cabeçalho do relatório */}
      <header className="border-b pb-3">
        <h1 className="text-xl font-bold tracking-tight">
          Relatório de aulas — {professor.name}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {tenant.name} · Período: {period.label} ·{" "}
          {format(period.from, "dd/MM/yyyy")} a {format(period.to, "dd/MM/yyyy")}
        </p>
      </header>

      {/* Total em destaque */}
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-medium text-muted-foreground">
            Total geral a pagar
          </span>
          <span className="text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
            {brl(report.total)}
          </span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {report.totalAulas} aula{report.totalAulas === 1 ? "" : "s"} no período
        </div>
      </section>

      {/* Categorias */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">Aulas por tipo</h2>
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
          <h2 className="mb-2 text-sm font-semibold">
            Particulares ({report.particulars.length})
          </h2>
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

      {/* Dias que deu aula */}
      <section>
        <h2 className="mb-2 text-sm font-semibold">
          Dias com aula ({report.days.length})
        </h2>
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

      {/* Gráfico/calendário das aulas dadas */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-2 text-sm font-semibold">
          Calendário das aulas ({calendar.totalCount})
        </h2>
        {calendar.totalCount === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma aula confirmada no período.</p>
        ) : (
          <ProfessorCalendar from={period.from} to={period.to} byDay={calendar.byDay} />
        )}
      </section>
    </main>
  );
}

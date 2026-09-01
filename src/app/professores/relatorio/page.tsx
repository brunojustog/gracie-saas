import { format } from "date-fns";
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

import { Pie, PIE_COLORS } from "../pie";
import { PrintButton } from "./print-button";
import { ReportBlock } from "./report-block";

const VALID_PRESETS: PeriodPreset[] = [
  "this_month",
  "last_month",
  "last_7_days",
  "last_30_days",
];

type SearchParams = Promise<{
  professor?: string;
  todos?: string;
  period?: string;
  from?: string;
  to?: string;
}>;

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function ProfessorReportPage({
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
  const periodLabel = `${period.label} · ${format(period.from, "dd/MM/yyyy")} a ${format(period.to, "dd/MM/yyyy")}`;

  const back = (() => {
    const q = new URLSearchParams();
    if (sp.period) q.set("period", sp.period);
    if (sp.from) q.set("from", sp.from);
    if (sp.to) q.set("to", sp.to);
    if (sp.professor) q.set("professor", sp.professor);
    return `/professores?${q.toString()}`;
  })();

  const ActionBar = (
    <div className="flex items-center justify-between gap-2 print:hidden">
      <Link
        href={back}
        className="inline-flex h-9 items-center gap-1 rounded-md border px-3 text-sm font-medium hover:bg-accent"
      >
        <ChevronLeft className="h-4 w-4" /> Voltar
      </Link>
      <PrintButton />
    </div>
  );

  // ---- Modo TODOS os professores ----
  if (sp.todos === "1" && !sp.professor) {
    const professors = await prisma.professor.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, isOwner: true },
    });
    const blocks = await Promise.all(
      professors.map(async (p) => ({
        name: p.name,
        isOwner: p.isOwner,
        report: await getProfessorReport(tenant.id, p.id, period.from, period.to),
        calendar: await getProfessorCalendar(tenant.id, p.id, period.from, period.to),
      })),
    );
    const withActivity = blocks.filter((b) => b.report.totalAulas > 0);
    // v1.2-AI: o gestor (isOwner) fica numa seção à parte, fora do total geral.
    const profBlocks = withActivity.filter((b) => !b.isOwner);
    const ownerBlocks = withActivity.filter((b) => b.isOwner);

    type Block = (typeof withActivity)[number];
    const totalOf = (bs: Block[]) => bs.reduce((s, b) => s + b.report.total, 0);
    const combinedSlicesOf = (bs: Block[]) =>
      bs.flatMap((b) => {
        const particulares = b.report.particulars.length;
        const regulares = b.report.totalAulas - particulares;
        const out: { label: string; value: number }[] = [];
        if (regulares > 0) out.push({ label: `${b.name} · Regulares`, value: regulares });
        if (particulares > 0) out.push({ label: `${b.name} · Particulares`, value: particulares });
        return out;
      });

    // Card resumo (total + pizza Regulares×Particulares) de um grupo.
    const summaryCard = (bs: Block[], totalLabel: string) => {
      const slices = combinedSlicesOf(bs);
      return (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-medium">{totalLabel}</span>
            <span className="text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
              {brl(totalOf(bs))}
            </span>
          </div>
          {slices.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-primary/20 pt-3">
              <Pie slices={slices} size={128} />
              <ul className="min-w-0 flex-1 space-y-0.5 text-sm">
                {slices.map((s, i) => (
                  <li key={s.label} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      <span className="truncate">{s.label}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {s.value} aula{s.value === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      );
    };

    const blockList = (bs: Block[]) =>
      bs.map((b, i) => (
        <div key={b.name} className={i > 0 ? "border-t pt-6 print:break-before-page" : ""}>
          <ReportBlock
            professorName={b.name}
            report={b.report}
            calendar={b.calendar}
            from={period.from}
            to={period.to}
            showName
          />
        </div>
      ));

    return (
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6 print:max-w-none print:px-0 print:py-0">
        {ActionBar}
        <header className="border-b pb-3">
          <h1 className="text-xl font-bold tracking-tight">
            Relatório geral — professores
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {tenant.name} · {periodLabel}
          </p>
        </header>

        {withActivity.length === 0 ? (
          <p className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
            Nenhuma aula confirmada no período.
          </p>
        ) : (
          <>
            {/* Professores (sem o gestor) */}
            {summaryCard(
              profBlocks,
              `Total geral a pagar — ${profBlocks.length} professor${profBlocks.length === 1 ? "" : "es"} (sem o gestor)`,
            )}
            {blockList(profBlocks)}

            {/* Gestor à parte */}
            {ownerBlocks.length > 0 ? (
              <div className="print:break-before-page">
                <h2 className="mb-3 border-b pb-1 text-lg font-bold">
                  Gestor · recebimento à parte
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    (não entra no total acima)
                  </span>
                </h2>
                {summaryCard(ownerBlocks, "Total do gestor (Anderson)")}
                <div className="mt-6">{blockList(ownerBlocks)}</div>
              </div>
            ) : null}
          </>
        )}
      </main>
    );
  }

  // ---- Modo professor individual ----
  const professorId = sp.professor;
  if (!professorId) notFound();

  const professor = await prisma.professor.findFirst({
    where: { id: professorId, tenantId: tenant.id },
    select: { name: true },
  });
  if (!professor) notFound();

  const [report, calendar] = await Promise.all([
    getProfessorReport(tenant.id, professorId, period.from, period.to),
    getProfessorCalendar(tenant.id, professorId, period.from, period.to),
  ]);

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 print:max-w-none print:px-0 print:py-0">
      {ActionBar}
      <header className="border-b pb-3">
        <h1 className="text-xl font-bold tracking-tight">
          Relatório de aulas — {professor.name}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {tenant.name} · {periodLabel}
        </p>
      </header>
      <ReportBlock
        professorName={professor.name}
        report={report}
        calendar={calendar}
        from={period.from}
        to={period.to}
      />
    </main>
  );
}

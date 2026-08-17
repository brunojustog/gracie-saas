import { endOfMonth, format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";
import { ExpPeriodFilter } from "@/app/quadro/exp-period-filter";
import { prisma } from "@/lib/prisma";
import {
  type PeriodPreset,
  resolveCustom,
  resolvePreset,
} from "@/lib/period";
import { signOut } from "@/server/auth";
import {
  getConversionMap,
  getMonthProjection,
  getProfessorClosing,
  getTaughtClassesForAdmin,
} from "@/server/professor-classes";
import { requireRole } from "@/server/tenant";

import { Pie, PIE_COLORS } from "./pie";
import { ProfessorFilter } from "./professor-filter";
import { TaughtManager } from "./taught-manager";

const VALID_PRESETS: PeriodPreset[] = [
  "this_month",
  "last_month",
  "last_7_days",
  "last_30_days",
];

type SearchParams = Promise<{
  period?: string;
  from?: string;
  to?: string;
  professor?: string;
}>;

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function ProfessoresFechamentoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, user, membership } = await requireRole("ADMIN");
  const sp = await searchParams;

  const custom = sp.from && sp.to ? resolveCustom(sp.from, sp.to) : null;
  const preset: PeriodPreset = VALID_PRESETS.includes(sp.period as PeriodPreset)
    ? (sp.period as PeriodPreset)
    : "this_month";
  const period = custom ?? resolvePreset(preset);
  const selector: PeriodPreset | "custom" = custom ? "custom" : preset;
  const professorId = sp.professor || undefined;
  const now = new Date();

  const [{ rows, totalGeral }, projection, taught, professors, conversionMap] =
    await Promise.all([
      getProfessorClosing(tenant.id, period.from, period.to, professorId),
      getMonthProjection(tenant.id, startOfMonth(now), endOfMonth(now)),
      getTaughtClassesForAdmin(tenant.id, period.from, period.to, professorId),
      prisma.professor.findMany({
        where: { tenantId: tenant.id, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      getConversionMap(tenant.id, period.from, period.to),
    ]);

  const conversions = [...conversionMap.entries()]
    .filter(([pid]) => !professorId || pid === professorId)
    .map(([pid, v]) => ({ professorId: pid, ...v }))
    .sort((a, b) => b.valor - a.valor);

  const projByProf = professorId
    ? projection.byProfessor.filter((p) => p.professorId === professorId)
    : projection.byProfessor;

  return (
    <>
      <TopNav
        tenantName={tenant.name}
        tenantColor={tenant.primaryColor}
        userEmail={user.email}
        role={membership.role}
        signOutSlot={
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="outline" size="sm" className="h-8">
              Sair
            </Button>
          </form>
        }
      />
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">Professores</h1>
            <p className="text-xs text-muted-foreground">
              Aulas dadas e fechamento · {period.label}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/professor"
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent"
            >
              Minhas aulas
            </Link>
            <ProfessorFilter professors={professors} current={professorId ?? null} />
            <ExpPeriodFilter current={selector} from={sp.from} to={sp.to} />
          </div>
        </div>

        {/* Cartões por professor: pizza por modalidade + valores */}
        {rows.length === 0 ? (
          <div className="rounded-lg border bg-card p-10 text-center text-sm text-muted-foreground">
            Nenhuma aula confirmada no período.
          </div>
        ) : (
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((r) => (
              <div key={r.professorId} className="rounded-xl border bg-card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-semibold">{r.professorName}</span>
                  <span className="text-sm font-bold text-emerald-700 tabular-nums dark:text-emerald-300">
                    {brl(r.total)}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Pie slices={r.byModality.map((m) => ({ label: m.label, value: m.count }))} size={104} />
                  <ul className="min-w-0 flex-1 space-y-0.5 text-xs">
                    {r.byModality.map((m, i) => (
                      <li key={m.label} className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                          />
                          <span className="truncate">{m.label}</span>
                          <span className="text-muted-foreground">{m.count}×</span>
                        </span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">
                          {brl(m.valor)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </section>
        )}

        {rows.length > 0 ? (
          <div className="flex items-center justify-end gap-2 text-sm">
            <span className="text-muted-foreground">Total geral a repassar no período:</span>
            <span className="font-bold text-emerald-700 tabular-nums dark:text-emerald-300">
              {brl(totalGeral)}
            </span>
          </div>
        ) : null}

        {/* Projeção do mês (a partir da grade padrão) */}
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-1">
            <h2 className="text-sm font-bold capitalize">
              Projeção de {format(now, "MMMM", { locale: ptBR })}
            </h2>
            <span className="text-xs text-muted-foreground">
              baseada na grade padrão (feriados/ajustes são manuais)
            </span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                Por modalidade
              </div>
              <ul className="space-y-0.5 text-sm">
                {projection.byModality.map((m) => (
                  <li key={m.label} className="flex items-center justify-between">
                    <span>{m.label} <span className="text-xs text-muted-foreground">{m.count}×</span></span>
                    <span className="tabular-nums text-muted-foreground">{brl(m.valor)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1 text-[11px] font-semibold uppercase text-muted-foreground">
                Por professor
              </div>
              <ul className="space-y-0.5 text-sm">
                {projByProf.map((p) => (
                  <li key={p.professorId} className="flex items-center justify-between">
                    <span>{p.professorName} <span className="text-xs text-muted-foreground">{p.count}×</span></span>
                    <span className="tabular-nums text-muted-foreground">{brl(p.valor)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-2 border-t border-primary/20 pt-2 text-sm font-semibold">
            Projeção total do mês: {projection.totalCount} aulas ·{" "}
            <span className="text-emerald-700 dark:text-emerald-300">{brl(projection.totalValor)}</span>
            <span className="ml-1 text-[11px] font-normal text-muted-foreground">
              (só aulas regulares/kids da grade; particulares e auxílios entram no realizado)
            </span>
          </div>
        </section>

        {/* v1.1-CH: experimentais convertidas em matrícula, por professor. */}
        <section className="rounded-xl border bg-card p-4">
          <div className="mb-2">
            <h2 className="text-sm font-semibold">Experimentais convertidas</h2>
            <p className="text-xs text-muted-foreground">
              Alunos que fizeram experimental e matricularam no período — bônus
              de 1,5× a hora-aula pro professor que deu a aula.
            </p>
          </div>
          {conversions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma conversão de experimental no período.
            </p>
          ) : (
            <div className="space-y-2">
              {conversions.map((c) => (
                <div key={c.professorId} className="rounded border p-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{c.professorName}</span>
                    <span className="font-semibold text-emerald-700 tabular-nums dark:text-emerald-300">
                      {c.count}× · {brl(c.valor)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {c.alunos.map((a, i) => (
                      <span key={i}>
                        {a.nome} · {format(new Date(a.data), "dd/MM", { locale: ptBR })}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Gerenciar aulas dadas (editar/excluir) */}
        <section className="space-y-2">
          <h2 className="text-sm font-semibold">Aulas dadas no período (gerenciar)</h2>
          <p className="text-xs text-muted-foreground">
            Edite quem deu / o auxiliar, ou apague um registro errado.
          </p>
          <TaughtManager rows={taughtToPlain(taught)} professors={professors} />
        </section>
      </main>
    </>
  );
}

function taughtToPlain(
  rows: Awaited<ReturnType<typeof getTaughtClassesForAdmin>>,
) {
  return rows.map((r) => ({ ...r, date: r.date.toISOString() }));
}

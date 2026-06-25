import type { ExperimentalClassStatus } from "@prisma/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { DrillNumber, type DrillItem } from "@/components/drill-number";
import { TopNav } from "@/components/top-nav";
import {
  type PeriodPreset,
  resolveCustom,
  resolvePreset,
} from "@/lib/period";
import { signOut } from "@/server/auth";
import { getQuadroData } from "@/server/quadro";
import { requireRole } from "@/server/tenant";

import { ExpPeriodFilter } from "./exp-period-filter";

const VALID_PRESETS: PeriodPreset[] = [
  "this_month",
  "last_month",
  "last_7_days",
  "last_30_days",
];

type SearchParams = Promise<{ period?: string; from?: string; to?: string }>;

const PAYMENT_LABEL: Record<string, string> = {
  PIX: "Pix",
  CREDIT_CARD: "Cartão de crédito",
  BOLETO: "Boleto",
  CASH: "Dinheiro",
  TRANSFER: "Transferência",
  OTHER: "Outro",
};

const CLASS_STATUS_LABEL: Record<ExperimentalClassStatus, string> = {
  SCHEDULED: "Agendada",
  CONFIRMED: "Confirmada",
  ATTENDED: "Compareceu",
  NO_SHOW: "Faltou",
  RESCHEDULED: "Remarcada",
  CANCELED: "Cancelada",
};

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export default async function QuadroPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Admin-only. requireRole redireciona quem não for ADMIN pra /dashboard.
  const { tenant, user, membership } = await requireRole("ADMIN");
  const sp = await searchParams;

  // Período da segmentação de experimentais (item 4). Default = mês atual.
  const customPeriod = sp.from && sp.to ? resolveCustom(sp.from, sp.to) : null;
  const preset: PeriodPreset = VALID_PRESETS.includes(sp.period as PeriodPreset)
    ? (sp.period as PeriodPreset)
    : "this_month";
  const expPeriod = customPeriod ?? resolvePreset(preset);
  const expSelector: PeriodPreset | "custom" = customPeriod ? "custom" : preset;

  const data = await getQuadroData(tenant.id, expPeriod);

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
      <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Quadro do Vitor</h1>
          <p className="text-xs text-muted-foreground">
            Visão gerencial da academia · atualizado em{" "}
            {format(data.generatedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>

        {/* 1) Número de matrículas (espelha a planilha) */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="Número de matrículas">
            <table className="w-full text-sm">
              <tbody>
                <Row label="Total de alunos ativos" value={data.matriculas.totalActive} strong items={data.names.ativos} />
                <Row
                  label="Ativos inadimplentes"
                  value={data.matriculas.overdue}
                  hint="estão dentro do total acima"
                  tone={data.matriculas.overdue > 0 ? "red" : undefined}
                  items={data.names.overdue}
                />
                <Spacer />
                <Row label="Total adultos" value={data.matriculas.adults.total} strong items={[...data.names.adults.female, ...data.names.adults.male, ...data.names.adults.unknown]} />
                <Row label="Mulheres" value={data.matriculas.adults.female} indent items={data.names.adults.female} />
                <Row label="Homens" value={data.matriculas.adults.male} indent items={data.names.adults.male} />
                {data.matriculas.adults.unknown > 0 ? (
                  <Row label="Sem gênero informado" value={data.matriculas.adults.unknown} indent muted items={data.names.adults.unknown} />
                ) : null}
                <Spacer />
                <Row label="Total kids" value={data.matriculas.kids.total} strong items={[...data.names.kids.female, ...data.names.kids.male, ...data.names.kids.unknown]} />
                <Row label="Meninas" value={data.matriculas.kids.female} indent items={data.names.kids.female} />
                <Row label="Meninos" value={data.matriculas.kids.male} indent items={data.names.kids.male} />
                {data.matriculas.kids.unknown > 0 ? (
                  <Row label="Sem gênero informado" value={data.matriculas.kids.unknown} indent muted items={data.names.kids.unknown} />
                ) : null}
              </tbody>
            </table>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Gênero e turma kids vêm da ficha do aluno / modalidade. Ajuste em
              Configurações → Modalidades (turma kids) ou na ficha do lead (gênero).
            </p>
          </Panel>

          <div className="space-y-4">
            <Panel title="Planos" subtitle="Matrículas ativas por plano">
              <KeyValueList
                rows={data.planos.map((p) => ({
                  label: p.name,
                  value: p.count,
                  items: data.names.byPlan[p.name] ?? [],
                }))}
                emptyLabel="Nenhuma matrícula ativa."
              />
            </Panel>
            <Panel title="Pagamento" subtitle="Matrículas ativas por forma de pagamento">
              <KeyValueList
                rows={data.pagamento.map((p) => ({
                  label: PAYMENT_LABEL[p.method] ?? p.method,
                  value: p.count,
                  items: data.names.byPayment[p.method] ?? [],
                }))}
                emptyLabel="Nenhuma matrícula ativa."
              />
            </Panel>
            <Panel title="Cancelamentos">
              <div className="flex items-baseline gap-2">
                <DrillNumber
                  value={data.cancelamentos}
                  title="Cancelamentos"
                  items={data.names.cancelamentos}
                  className="text-3xl font-semibold"
                />
                <span className="text-xs text-muted-foreground">
                  total na vida da academia
                </span>
              </div>
            </Panel>
          </div>
        </section>

        {/* 8) Receita global (mensalidades + particulares + avulsas) — v1.1-AO/BD */}
        <Panel
          title="Receita"
          subtitle="Mensalidades recorrentes + aulas particulares + aulas avulsas"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <RevenueCard
              label="Mensalidades ativas"
              value={data.revenue.monthlyRecurring}
              hint="recorrente por mês"
            />
            <RevenueCard
              label="Aulas particulares (mês)"
              value={data.revenue.privateThisMonth}
              hint={`${data.revenue.privateActiveCount} pacote(s) em andamento`}
            />
            <RevenueCard
              label="Aulas avulsas (mês)"
              value={data.revenue.looseThisMonth}
              hint={`${data.revenue.looseCountThisMonth} aula(s) no mês`}
            />
            <RevenueCard
              label="Receita global do mês"
              value={data.revenue.globalThisMonth}
              hint="mensalidades + particulares + avulsas"
              strong
            />
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Particulares acumulado:{" "}
            {data.revenue.privateAllTime.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}{" "}
            · Avulsas acumulado:{" "}
            {data.revenue.looseAllTime.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </p>
        </Panel>

        {/* Aulas particulares (v1.1-AV) — separado dos mensalistas + total geral */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="Aulas particulares"
            subtitle="Pacotes avulsos — NÃO contam como matrícula/mensalista"
          >
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded border bg-muted/40 p-3">
                <DrillNumber
                  value={data.particulares.ativos}
                  title="Aulas particulares em andamento"
                  items={data.names.particularesAtivos}
                  className="text-2xl font-semibold"
                />
                <div className="text-[11px] uppercase text-muted-foreground">Em andamento</div>
              </div>
              <div className="rounded border bg-muted/40 p-3">
                <div className="text-2xl font-semibold">{data.particulares.concluidos}</div>
                <div className="text-[11px] uppercase text-muted-foreground">Concluídos</div>
              </div>
              <div className="rounded border bg-muted/40 p-3">
                <div className="text-2xl font-semibold">{data.particulares.cancelados}</div>
                <div className="text-[11px] uppercase text-muted-foreground">Cancelados</div>
              </div>
            </div>
          </Panel>
          <Panel
            title="Total geral de alunos"
            subtitle="Mensalistas ativos + alunos de aula particular (visão somada)"
          >
            <div className="flex items-baseline gap-2">
              <DrillNumber
                value={data.totalGeralAlunos}
                title="Total geral de alunos"
                items={[...data.names.ativos, ...data.names.particularesAtivos]}
                className="text-3xl font-semibold"
              />
              <span className="text-xs text-muted-foreground">
                {data.matriculas.totalActive} mensalistas + {data.particulares.ativos} particulares
              </span>
            </div>
          </Panel>
        </section>

        {/* Aulas avulsas (v1.1-BD) — pessoas que pagaram 1 aula só */}
        <Panel
          title="Aulas avulsas"
          subtitle="Pessoas que pagaram uma aula só (sem pacote/matrícula)"
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <RevenueCard
              label="Valor no mês"
              value={data.revenue.looseThisMonth}
              hint={`${data.revenue.looseCountThisMonth} aula(s) no mês`}
            />
            <RevenueCard
              label="Valor acumulado"
              value={data.revenue.looseAllTime}
              hint={`${data.revenue.looseCountAllTime} aula(s) no total`}
            />
            <div className="rounded border bg-muted/40 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                Aulas no mês
              </div>
              <div className="mt-0.5 text-2xl font-semibold">
                {data.revenue.looseCountThisMonth}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {data.revenue.looseCountAllTime} no total
              </div>
            </div>
          </div>
        </Panel>

        {/* 4 + 6) Crescimento e churn mês a mês */}
        <Panel
          title="Crescimento e churn (mês a mês)"
          subtitle="Ativos = matrículas ativas (congelados não contam, igual ao número grande). Conta: início + novas − cancelamentos − congelados ≈ ativos no fim."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2 text-left font-medium">Mês</th>
                  <th className="px-2 py-2 text-right font-medium">Ativos no início</th>
                  <th className="px-2 py-2 text-right font-medium">Novas matrículas</th>
                  <th className="px-2 py-2 text-right font-medium">Cancelamentos</th>
                  <th className="px-2 py-2 text-right font-medium">Congelados</th>
                  <th className="px-2 py-2 text-right font-medium">Churn</th>
                </tr>
              </thead>
              <tbody>
                {data.growth.map((m) => (
                  <tr key={m.label} className="border-b last:border-0">
                    <td className="px-2 py-2 font-medium capitalize">{m.label}</td>
                    <td className="px-2 py-2 text-right">{m.activeStart}</td>
                    <td className="px-2 py-2 text-right text-emerald-700 dark:text-emerald-300">
                      <DrillNumber
                        value={`+${m.newInMonth}`}
                        title={`Novas matrículas · ${m.label}`}
                        items={m.newNames}
                        className="font-medium"
                      />
                    </td>
                    <td className="px-2 py-2 text-right text-red-700 dark:text-red-300">
                      <DrillNumber
                        value={`−${m.canceledInMonth}`}
                        title={`Cancelamentos · ${m.label}`}
                        items={m.canceledNames}
                        className="font-medium"
                      />
                    </td>
                    <td className="px-2 py-2 text-right text-amber-700 dark:text-amber-300">
                      {m.frozenInMonth}
                    </td>
                    <td className="px-2 py-2 text-right">{fmtPct(m.churnPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* 5) Vendas por vendedora */}
        <Panel
          title="Matrículas por vendedora"
          subtitle="Matrículas fechadas por mês (clique nos números pra ver os nomes)"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2 text-left font-medium">Vendedora</th>
                  {data.salesMonthLabels.map((l) => (
                    <th key={l} className="px-2 py-2 text-right font-medium capitalize">
                      {l}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.sellerRanking.length === 0 ? (
                  <tr>
                    <td colSpan={data.salesMonthLabels.length + 2} className="px-2 py-3 text-center text-muted-foreground">
                      Nenhuma matrícula nos últimos meses.
                    </td>
                  </tr>
                ) : (
                  data.sellerRanking.map((s) => (
                    <tr key={s.name} className="border-b last:border-0">
                      <td className="px-2 py-2 font-medium">{s.name}</td>
                      {s.counts.map((c, i) => (
                        <td key={i} className="px-2 py-2 text-right">
                          {c > 0 ? (
                            <DrillNumber
                              value={c}
                              title={`${s.name} · ${data.salesMonthLabels[i]}`}
                              items={s.names[i] ?? []}
                            />
                          ) : (
                            c
                          )}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-right font-semibold">
                        <DrillNumber
                          value={s.total}
                          title={`${s.name} · total`}
                          items={s.totalNames}
                          className="font-semibold"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        {/* Matrículas com vs sem aula experimental (v1.1-BF, item 2) */}
        <Panel
          title="Matrículas com vs sem aula experimental"
          subtitle="Vitalício — de todas as matrículas, quantos alunos chegaram a fazer uma experimental e quantos fecharam direto. Clique pra ver os nomes."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <OutcomeCard
              label="Total de matrículas"
              items={[...data.matriculasExp.comExp, ...data.matriculasExp.semExp]}
              tone="primary"
            />
            <OutcomeCard
              label="Fizeram experimental"
              items={data.matriculasExp.comExp}
              tone="emerald"
            />
            <OutcomeCard
              label="Fecharam sem experimental"
              items={data.matriculasExp.semExp}
              tone="amber"
            />
          </div>
        </Panel>

        {/* Segmentação de experimentais por período (v1.1-BC/BE, itens 4/6/7/8) */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            Aulas experimentais · {data.expPeriodLabel}
          </h2>
          <ExpPeriodFilter current={expSelector} from={sp.from} to={sp.to} />
        </div>

        <section className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="Aulas experimentais (período)"
            subtitle="Clique nos números pra ver os nomes"
          >
            <div className="flex flex-wrap gap-2 text-sm">
              <StatChip label="no período" value={data.expStats.total} items={data.expStats.totalNames} tone="primary" />
              <StatChip label="compareceram" prefix="✓ " value={data.expStats.attended.length} items={data.expStats.attended} tone="emerald" />
              <StatChip label="faltas" prefix="✗ " value={data.expStats.noShow.length} items={data.expStats.noShow} tone="red" />
              <StatChip label="reagendadas" prefix="↻ " value={data.expStats.rescheduled.length} items={data.expStats.rescheduled} tone="amber" />
              <StatChip label="futuras" prefix="→ " value={data.expStats.upcoming.length} items={data.expStats.upcoming} tone="sky" />
              {data.expStats.unregistered.length > 0 ? (
                <StatChip label="sem registro" prefix="! " value={data.expStats.unregistered.length} items={data.expStats.unregistered} tone="zinc" />
              ) : null}
            </div>
          </Panel>

          <Panel
            title="Experimentais por programa (período)"
            subtitle="GB1 / GB2 / GBF / GBK… — clique pra ver os nomes"
          >
            <KeyValueList
              rows={data.expByProgram.map((p) => ({
                label: p.program,
                value: p.count,
                items: p.names,
              }))}
              emptyLabel="Nenhuma aula experimental no período."
            />
          </Panel>
        </section>

        {/* Destino dos leads que fizeram experimental no período (item 8) */}
        <Panel
          title="Para onde foram os leads que fizeram experimental"
          subtitle="Dos que fizeram aula no período: 'Matriculou' = tem matrícula registrada (Enrollment). Clique pra ver os nomes."
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <OutcomeCard label="Matriculou" items={data.expOutcomes.matriculou} tone="emerald" />
            <OutcomeCard label="Negociação" items={data.expOutcomes.negociacao} tone="sky" />
            <OutcomeCard label="Nutrição" items={data.expOutcomes.nutricao} tone="amber" />
            <OutcomeCard label="Perda" items={data.expOutcomes.perda} tone="red" />
          </div>
        </Panel>

        {/* 7) Conversão experimental → matrícula */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="Conversão de aulas experimentais"
            subtitle="Dos leads que compareceram a uma aula, quantos viraram matrícula"
          >
            <div className="grid grid-cols-2 gap-3">
              <ConversionCard label="Últimos 30 dias" c={data.conversion.d30} />
              <ConversionCard label="Últimos 90 dias" c={data.conversion.d90} />
            </div>
          </Panel>

          {/* 2) Pós-experimental em conversa — resumo */}
          <Panel
            title="Pós-experimental em conversa"
            subtitle="Fizeram aula experimental, ainda sem matrícula e não perdidos"
          >
            <div className="flex items-baseline gap-2">
              <DrillNumber
                value={data.posExperimental.length}
                title="Pós-experimental em conversa"
                items={data.posExperimental.map((l) => ({
                  id: l.id,
                  name: l.name,
                  sub: l.stage,
                  href: `/kanban?q=${encodeURIComponent(l.name)}`,
                }))}
                className="text-3xl font-semibold"
              />
              <span className="text-xs text-muted-foreground">
                em conversa · {data.posExpLastWeek} fizeram aula na última semana
              </span>
            </div>
          </Panel>
        </section>

        {/* 2) Pós-experimental — lista completa */}
        <Panel
          title="Leads pós-experimental (lista)"
          subtitle="Quem fez aula e ainda não fechou — ordenado pela última interação"
        >
          {data.posExperimental.length === 0 ? (
            <p className="text-xs text-muted-foreground">Ninguém em conversa no momento.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="px-2 py-2 text-left font-medium">Lead</th>
                    <th className="px-2 py-2 text-left font-medium">Estágio</th>
                    <th className="px-2 py-2 text-left font-medium">Modalidade</th>
                    <th className="px-2 py-2 text-left font-medium">Vendedora</th>
                    <th className="px-2 py-2 text-right font-medium">Última aula</th>
                  </tr>
                </thead>
                <tbody>
                  {data.posExperimental.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="px-2 py-2">
                        <div className="font-medium">{l.name}</div>
                        {l.phone ? (
                          <div className="text-[11px] text-muted-foreground">{l.phone}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-muted-foreground">{l.stage}</td>
                      <td className="px-2 py-2 text-muted-foreground">{l.modality ?? "—"}</td>
                      <td className="px-2 py-2 text-muted-foreground">{l.seller ?? "—"}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground">
                        {l.lastClassAt
                          ? `${format(new Date(l.lastClassAt), "dd/MM")}${l.daysSince !== null ? ` · há ${l.daysSince}d` : ""}`
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        {/* 3) Agenda de experimentais (semana passada / atual) */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Panel title="Aulas experimentais — semana passada">
            <AgendaList rows={data.agenda.lastWeek} />
          </Panel>
          <Panel title="Aulas experimentais — semana atual">
            <AgendaList rows={data.agenda.thisWeek} />
          </Panel>
        </section>
      </main>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  indent,
  muted,
  hint,
  tone,
  items,
}: {
  label: string;
  value: number;
  strong?: boolean;
  indent?: boolean;
  muted?: boolean;
  hint?: string;
  tone?: "red";
  /** v1.1-AY: nomes pro drill-down ao clicar no número. */
  items?: DrillItem[];
}) {
  return (
    <tr className="border-b last:border-0">
      <td className={`py-1.5 ${indent ? "pl-4" : ""} ${strong ? "font-semibold" : ""} ${muted ? "text-muted-foreground" : ""}`}>
        {label}
        {hint ? <span className="ml-1 text-[11px] text-muted-foreground">({hint})</span> : null}
      </td>
      <td className={`py-1.5 text-right tabular-nums ${strong ? "font-semibold" : ""} ${tone === "red" ? "text-red-700 dark:text-red-300" : ""}`}>
        {items ? (
          <DrillNumber value={value} title={label} items={items} />
        ) : (
          value
        )}
      </td>
    </tr>
  );
}

function Spacer() {
  return (
    <tr>
      <td colSpan={2} className="py-1" />
    </tr>
  );
}

function KeyValueList({
  rows,
  emptyLabel,
}: {
  rows: Array<{ label: string; value: number; items?: DrillItem[] }>;
  emptyLabel: string;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  return (
    <table className="w-full text-sm">
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} className="border-b last:border-0">
            <td className="py-1.5">{r.label}</td>
            <td className="py-1.5 text-right font-medium tabular-nums">
              {r.items ? (
                <DrillNumber value={r.value} title={r.label} items={r.items} />
              ) : (
                r.value
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RevenueCard({
  label,
  value,
  hint,
  strong,
}: {
  label: string;
  value: number;
  hint?: string;
  strong?: boolean;
}) {
  return (
    <div className={`rounded border p-3 ${strong ? "bg-primary/5" : "bg-muted/40"}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 font-semibold ${strong ? "text-2xl" : "text-xl"}`}>
        {value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
      </div>
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function ConversionCard({
  label,
  c,
}: {
  label: string;
  c: { attended: number; enrolled: number; pct: number };
}) {
  return (
    <div className="rounded border bg-muted/40 p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold">{c.pct.toFixed(0)}%</div>
      <div className="text-[11px] text-muted-foreground">
        {c.enrolled} de {c.attended} matricularam
      </div>
    </div>
  );
}

// ── Experimentais do mês (v1.1-BC) ──────────────────────────────────────────

type Tone = "primary" | "emerald" | "red" | "amber" | "sky" | "zinc";

const CHIP_TONE: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  zinc: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

/** Chip clicável (pílula) com nomes por trás — espelha os chips da agenda. */
function StatChip({
  label,
  value,
  items,
  tone,
  prefix = "",
}: {
  label: string;
  value: number;
  items: DrillItem[];
  tone: Tone;
  prefix?: string;
}) {
  return (
    <DrillNumber
      variant="plain"
      title={label}
      items={items}
      className={`rounded-full px-2.5 py-1 font-medium ${CHIP_TONE[tone]}`}
      value={`${prefix}${value} ${label}`}
    />
  );
}

/** Card de destino (ganho/negociação/nutrição/perda) com drill-down. */
function OutcomeCard({
  label,
  items,
  tone,
}: {
  label: string;
  items: DrillItem[];
  tone: Tone;
}) {
  return (
    <div className={`rounded border p-3 text-center ${CHIP_TONE[tone]}`}>
      <DrillNumber
        value={items.length}
        title={label}
        items={items}
        className="text-2xl font-semibold"
      />
      <div className="text-[11px] uppercase tracking-wide opacity-80">{label}</div>
    </div>
  );
}

function AgendaList({
  rows,
}: {
  rows: Array<{
    scheduledDate: Date | string;
    status: ExperimentalClassStatus;
    leadName: string;
    phone: string | null;
    modality: string;
  }>;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhuma aula no período.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              <td className="py-1.5 pr-2 whitespace-nowrap text-muted-foreground">
                {format(new Date(r.scheduledDate), "EEE dd/MM HH:mm", { locale: ptBR })}
              </td>
              <td className="py-1.5 pr-2 font-medium">{r.leadName}</td>
              <td className="py-1.5 pr-2 text-muted-foreground">{r.modality}</td>
              <td className="py-1.5 text-right text-[11px] text-muted-foreground">
                {CLASS_STATUS_LABEL[r.status]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

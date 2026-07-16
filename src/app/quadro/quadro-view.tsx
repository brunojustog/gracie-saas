import type { ExperimentalClassStatus } from "@prisma/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { DrillNumber, type DrillItem } from "@/components/drill-number";
import type { PeriodPreset } from "@/lib/period";
import type { DailySnapshot } from "@/server/daily-report";
import { EXP_SPLIT_SINCE, type QuadroData } from "@/server/quadro";

import { ExpPeriodFilter } from "./exp-period-filter";

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

/**
 * Corpo do Quadro do Vitor (v1.1-BF) — reutilizado pela página interna
 * (/quadro) e pela visão pública por link (/p/quadro/[token]).
 * `publicMode` esconde números financeiros (R$) e o filtro de período.
 */
export function QuadroBody({
  data,
  expSelector,
  from,
  to,
  publicMode = false,
  shareSlot,
  dailySnapshots,
}: {
  data: QuadroData;
  expSelector: PeriodPreset | "custom";
  from?: string;
  to?: string;
  publicMode?: boolean;
  shareSlot?: React.ReactNode;
  /** v1.1-BJ: faixa "últimos dias" (resumo diário). */
  dailySnapshots?: DailySnapshot[];
}) {
  return (
    <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Quadro do Vitor</h1>
          <p className="text-xs text-muted-foreground">
            Visão gerencial da academia · atualizado em{" "}
            {format(data.generatedAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
          </p>
        </div>
        {shareSlot}
      </div>

      {/* Resumo consolidado do mês (v1.1-BM, item 4) — painel fixo grandão. */}
      <MonthBoard m={data.monthResumo} ativos={data.matriculas.totalActive} />

      {dailySnapshots && dailySnapshots.length > 0 ? (
        <DailyStrip snapshots={dailySnapshots} />
      ) : null}

      {/* 1) Número de matrículas */}
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

      {/* Receita (escondida no modo público) */}
      {publicMode ? null : (
        <Panel
          title="Receita"
          subtitle="Mensalidades recorrentes + aulas particulares + aulas avulsas"
        >
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <RevenueCard label="Mensalidades ativas" value={data.revenue.monthlyRecurring} hint="recorrente por mês" />
            <RevenueCard label="Aulas particulares (mês)" value={data.revenue.privateThisMonth} hint={`${data.revenue.privateActiveCount} pacote(s) em andamento`} />
            <RevenueCard label="Aulas avulsas (mês)" value={data.revenue.looseThisMonth} hint={`${data.revenue.looseCountThisMonth} aula(s) no mês`} />
            <RevenueCard label="Receita global do mês" value={data.revenue.globalThisMonth} hint="mensalidades + particulares + avulsas" strong />
          </div>
        </Panel>
      )}

      {/* Aulas particulares + total geral */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Aulas particulares" subtitle="Pacotes avulsos — NÃO contam como matrícula/mensalista">
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
        <Panel title="Total geral de alunos" subtitle="Mensalistas ativos + alunos de aula particular (visão somada)">
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

      {/* Aulas avulsas — no modo público, só contagem (sem R$) */}
      <Panel title="Aulas avulsas" subtitle="Pessoas que pagaram uma aula só (sem pacote/matrícula)">
        {publicMode ? (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-semibold">{data.revenue.looseCountThisMonth}</span>
            <span className="text-xs text-muted-foreground">
              aula(s) avulsa(s) no mês · {data.revenue.looseCountAllTime} no total
            </span>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <RevenueCard label="Valor no mês" value={data.revenue.looseThisMonth} hint={`${data.revenue.looseCountThisMonth} aula(s) no mês`} />
            <RevenueCard label="Valor acumulado" value={data.revenue.looseAllTime} hint={`${data.revenue.looseCountAllTime} aula(s) no total`} />
            <div className="rounded border bg-muted/40 p-3">
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Aulas no mês</div>
              <div className="mt-0.5 text-2xl font-semibold">{data.revenue.looseCountThisMonth}</div>
              <div className="text-[11px] text-muted-foreground">{data.revenue.looseCountAllTime} no total</div>
            </div>
          </div>
        )}
      </Panel>

      {/* Crescimento e churn */}
      <Panel
        title="Crescimento e churn (mês a mês)"
        subtitle="Ativos = matrículas ativas (congelados não contam). Conta: início + novas − cancelamentos − congelados ≈ ativos no fim."
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
                    <DrillNumber value={`+${m.newInMonth}`} title={`Novas matrículas · ${m.label}`} items={m.newNames} className="font-medium" />
                  </td>
                  <td className="px-2 py-2 text-right text-red-700 dark:text-red-300">
                    <DrillNumber value={`−${m.canceledInMonth}`} title={`Cancelamentos · ${m.label}`} items={m.canceledNames} className="font-medium" />
                  </td>
                  <td className="px-2 py-2 text-right text-amber-700 dark:text-amber-300">{m.frozenInMonth}</td>
                  <td className="px-2 py-2 text-right">{fmtPct(m.churnPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Matrículas por vendedora */}
      <Panel
        title="Matrículas por vendedora"
        subtitle="Matrículas fechadas por mês, com cancelamentos do mês em vermelho (clique nos números pra ver os nomes). Base da comissão: fechadas − canceladas."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="px-2 py-2 text-left font-medium">Vendedora</th>
                {data.salesMonthLabels.map((l) => (
                  <th key={l} className="px-2 py-2 text-right font-medium capitalize">{l}</th>
                ))}
                <th className="px-2 py-2 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.sellerRanking.length === 0 ? (
                <tr>
                  <td colSpan={data.salesMonthLabels.length + 2} className="px-2 py-3 text-center text-muted-foreground">
                    Nenhuma matrícula no período.
                  </td>
                </tr>
              ) : (
                data.sellerRanking.map((s) => {
                  const cancelTotal = s.cancelCounts.reduce((a, b) => a + b, 0);
                  const cancelTotalNames = s.cancelNames.flat();
                  return (
                    <tr key={s.name} className="border-b last:border-0">
                      <td className="px-2 py-2 font-medium">{s.name}</td>
                      {s.counts.map((c, i) => {
                        const canc = s.cancelCounts[i] ?? 0;
                        return (
                          <td key={i} className="px-2 py-2 text-right align-top">
                            {c > 0 ? (
                              <DrillNumber value={c} title={`${s.name} · ${data.salesMonthLabels[i]}`} items={s.names[i] ?? []} />
                            ) : (
                              <span className="text-muted-foreground">{c}</span>
                            )}
                            {canc > 0 ? (
                              <div className="text-[11px] leading-tight text-red-600">
                                <DrillNumber
                                  value={`−${canc} canc.`}
                                  title={`${s.name} · cancelou · ${data.salesMonthLabels[i]}`}
                                  items={s.cancelNames[i] ?? []}
                                  className="text-red-600"
                                />
                              </div>
                            ) : null}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-right font-semibold align-top">
                        <DrillNumber value={s.total} title={`${s.name} · total`} items={s.totalNames} className="font-semibold" />
                        {cancelTotal > 0 ? (
                          <div className="text-[11px] leading-tight font-normal text-red-600">
                            <DrillNumber
                              value={`−${cancelTotal} canc.`}
                              title={`${s.name} · cancelou · total`}
                              items={cancelTotalNames}
                              className="text-red-600"
                            />
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Matrículas com vs sem aula experimental */}
      <Panel
        title="Matrículas com vs sem aula experimental"
        subtitle={`A partir de ${format(EXP_SPLIT_SINCE, "dd/MM/yyyy", { locale: ptBR })} — das matrículas novas, quantos fizeram experimental e quantos fecharam direto. Clique pra ver os nomes.`}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <OutcomeCard label="Total de matrículas" items={[...data.matriculasExp.comExp, ...data.matriculasExp.semExp]} tone="primary" />
          <OutcomeCard label="Fizeram experimental" items={data.matriculasExp.comExp} tone="emerald" />
          <OutcomeCard label="Fecharam sem experimental" items={data.matriculasExp.semExp} tone="amber" />
        </div>
      </Panel>

      {/* Segmentação de experimentais por período */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">
          Aulas experimentais · {data.expPeriodLabel}
        </h2>
        {publicMode ? null : (
          <ExpPeriodFilter current={expSelector} from={from} to={to} />
        )}
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Aulas experimentais (período)" subtitle="Clique nos números pra ver os nomes">
          <div className="flex flex-wrap gap-2 text-sm">
            <StatChip label="no período" value={data.expStats.total} items={data.expStats.totalNames} tone="primary" />
            <StatChip label="compareceram" prefix="✓ " value={data.expStats.attendedUnique} items={data.expStats.attended} tone="emerald" />
            <StatChip label="faltas" prefix="✗ " value={data.expStats.noShow.length} items={data.expStats.noShow} tone="red" />
            <StatChip label="reagendadas" prefix="↻ " value={data.expStats.rescheduled.length} items={data.expStats.rescheduled} tone="amber" />
            <StatChip label="futuras" prefix="→ " value={data.expStats.upcoming.length} items={data.expStats.upcoming} tone="sky" />
            {data.expStats.unregistered.length > 0 ? (
              <StatChip label="sem registro" prefix="! " value={data.expStats.unregistered.length} items={data.expStats.unregistered} tone="zinc" />
            ) : null}
            {data.expStats.canceled.length > 0 ? (
              <StatChip label="canceladas" prefix="⊘ " value={data.expStats.canceled.length} items={data.expStats.canceled} tone="zinc" />
            ) : null}
          </div>
          {/* v1.1-BM: "compareceram" = PESSOAS únicas; repetidas mostradas à parte. */}
          <p className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
            <span>
              <strong>{data.expStats.attendedUnique}</strong> pessoas compareceram
              {" "}(em <strong>{data.expStats.attended.length}</strong> aulas)
            </span>
            {data.expStats.attendedRepeated > 0 ? (
              <>
                <span>·</span>
                <span className="inline-flex items-center gap-1">
                  <DrillNumber
                    value={data.expStats.attendedRepeated}
                    title="Comparecimentos repetidos (mesmo lead voltou)"
                    items={data.expStats.attendedRepeaterNames}
                    className="font-medium text-amber-700 dark:text-amber-300"
                  />
                  <span>repetida(s) — mesmo lead veio 2+</span>
                </span>
              </>
            ) : null}
          </p>
        </Panel>

        <Panel title="Experimentais por programa (período)" subtitle="GB1 / GB2 / GBF / GBK… — clique pra ver os nomes">
          <KeyValueList
            rows={data.expByProgram.map((p) => ({ label: p.program, value: p.count, items: p.names }))}
            emptyLabel="Nenhuma aula experimental no período."
          />
        </Panel>
      </section>

      <Panel
        title="Para onde foram os leads que fizeram experimental"
        subtitle="Dos que COMPARECERAM a uma experimental no período: 'Matriculou' = tem matrícula registrada. 'Outros estágios' = ainda no funil (Agendamento, Potencial…). A soma bate com o 'compareceram' de cima. Clique pra ver os nomes."
      >
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <OutcomeCard label="Matriculou" items={data.expOutcomes.matriculou} tone="emerald" />
          <OutcomeCard label="Negociação" items={data.expOutcomes.negociacao} tone="sky" />
          <OutcomeCard label="Nutrição" items={data.expOutcomes.nutricao} tone="amber" />
          <OutcomeCard label="Perda" items={data.expOutcomes.perda} tone="red" />
          <OutcomeCard label="Outros estágios" items={data.expOutcomes.outros} tone="zinc" />
        </div>
      </Panel>

      {/* Conversão + pós-experimental resumo */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Conversão de aulas experimentais" subtitle="Dos leads que compareceram a uma aula, quantos viraram matrícula">
          <div className="grid grid-cols-2 gap-3">
            <ConversionCard label="Últimos 30 dias" c={data.conversion.d30} />
            <ConversionCard label="Últimos 90 dias" c={data.conversion.d90} />
          </div>
        </Panel>
        <Panel title="Pós-experimental em negociação" subtitle="Fizeram aula experimental, ainda sem matrícula e na etapa Negociação do funil">
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
              em negociação · {data.posExpLastWeek} fizeram aula na última semana
            </span>
          </div>
        </Panel>
      </section>

      {/* Pós-experimental — lista */}
      <Panel
        title="Leads pós-experimental (lista)"
        subtitle="Quem fez aula e ainda não fechou — ordenado pela última interação"
      >
        {data.posExperimental.length === 0 ? (
          <p className="text-xs text-muted-foreground">Ninguém em negociação no momento.</p>
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
                      {l.phone ? <div className="text-[11px] text-muted-foreground">{l.phone}</div> : null}
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

      {/* Agenda */}
      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Aulas experimentais — semana passada">
          <AgendaList rows={data.agenda.lastWeek} />
        </Panel>
        <Panel title="Aulas experimentais — semana atual">
          <AgendaList rows={data.agenda.thisWeek} />
        </Panel>
      </section>
    </main>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Faixa "resumo dos últimos dias" (v1.1-BJ) — 1 card por dia, atualiza 22h. */
function DailyStrip({ snapshots }: { snapshots: DailySnapshot[] }) {
  // `day` vem como DATE (UTC midnight) — reconstrói a data local pelos
  // componentes UTC pra não deslocar 1 dia no fuso.
  const dayLabel = (raw: Date | string) => {
    const d = new Date(raw);
    const local = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    return {
      dow: format(local, "EEE", { locale: ptBR }),
      date: format(local, "dd/MM", { locale: ptBR }),
    };
  };
  const last = snapshots.length - 1;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">Resumo dos últimos dias</h3>
        <p className="text-xs text-muted-foreground">
          Atualiza todo dia às 22h — entra o dia de hoje e sai o mais antigo.
        </p>
      </div>
      <div
        className="grid gap-2"
        style={{
          gridTemplateColumns: `repeat(${snapshots.length}, minmax(110px, 1fr))`,
        }}
      >
        {snapshots.map((s, i) => {
          const l = dayLabel(s.day);
          const isToday = i === last;
          return (
            <div
              key={String(s.day)}
              className={`rounded-lg border p-2.5 text-xs ${isToday ? "border-primary/40 bg-primary/5" : "bg-muted/30"}`}
            >
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="font-semibold capitalize">{l.dow}</span>
                <span className="text-muted-foreground">{l.date}</span>
              </div>
              <ul className="space-y-0.5">
                <li className="flex justify-between"><span>✅ Matríc.</span><span className="font-medium tabular-nums">{s.matriculas}</span></li>
                <li className="flex justify-between"><span>❌ Cancel.</span><span className="font-medium tabular-nums">{s.cancelamentos}</span></li>
                <li className="flex justify-between"><span>🥋 Exper.</span><span className="font-medium tabular-nums">{s.experimentais} ({s.compareceram})</span></li>
                <li className="flex justify-between"><span>🎟️ Avulsas</span><span className="font-medium tabular-nums">{s.avulsas}</span></li>
                <li className="flex justify-between border-t pt-0.5"><span>👥 Ativos</span><span className="font-semibold tabular-nums">{s.ativos}</span></li>
              </ul>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        🥋 Experimentais = total no dia (entre parênteses, quantos compareceram).
      </p>
    </div>
  );
}

/** Painel fixo grandão com o resumo consolidado do mês (v1.1-BM, item 4). */
function MonthBoard({
  m,
  ativos,
}: {
  m: {
    label: string;
    matriculas: number;
    cancelamentos: number;
    experimentais: number;
    compareceram: number;
    avulsas: number;
    ativos: number;
  };
  ativos: number;
}) {
  const saldo = m.matriculas - m.cancelamentos;
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-1">
        <h2 className="text-lg font-bold capitalize">Resumo de {m.label}</h2>
        <span className="text-xs text-muted-foreground">
          consolidado do mês (dia 1 até hoje) — o mesmo do WhatsApp
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Big label="Novas matrículas" value={m.matriculas} tone="emerald" />
        <Big label="Cancelamentos" value={m.cancelamentos} tone="red" />
        <Big
          label="Saldo do mês"
          value={`${saldo >= 0 ? "+" : ""}${saldo}`}
          tone={saldo >= 0 ? "emerald" : "red"}
        />
        <Big
          label="Experimentais"
          value={m.experimentais}
          sub={`${m.compareceram} compareceram`}
        />
        <Big label="Aulas avulsas" value={m.avulsas} />
        <Big label="Alunos ativos" value={ativos} strong />
      </div>
    </div>
  );
}

function Big({
  label,
  value,
  sub,
  tone,
  strong,
}: {
  label: string;
  value: number | string;
  sub?: string;
  tone?: "emerald" | "red";
  strong?: boolean;
}) {
  const color =
    tone === "emerald"
      ? "text-emerald-700 dark:text-emerald-300"
      : tone === "red"
        ? "text-red-700 dark:text-red-300"
        : "";
  return (
    <div className={`rounded-xl border bg-card p-3 ${strong ? "ring-1 ring-primary/40" : ""}`}>
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-0.5 text-3xl font-bold tabular-nums ${color}`}>{value}</div>
      {sub ? <div className="text-[11px] text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

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
  items?: DrillItem[];
}) {
  return (
    <tr className="border-b last:border-0">
      <td className={`py-1.5 ${indent ? "pl-4" : ""} ${strong ? "font-semibold" : ""} ${muted ? "text-muted-foreground" : ""}`}>
        {label}
        {hint ? <span className="ml-1 text-[11px] text-muted-foreground">({hint})</span> : null}
      </td>
      <td className={`py-1.5 text-right tabular-nums ${strong ? "font-semibold" : ""} ${tone === "red" ? "text-red-700 dark:text-red-300" : ""}`}>
        {items ? <DrillNumber value={value} title={label} items={items} /> : value}
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
              {r.items ? <DrillNumber value={r.value} title={r.label} items={r.items} /> : r.value}
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

type Tone = "primary" | "emerald" | "red" | "amber" | "sky" | "zinc";

const CHIP_TONE: Record<Tone, string> = {
  primary: "bg-primary/10 text-primary",
  emerald: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  sky: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  zinc: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

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
      <DrillNumber value={items.length} title={label} items={items} className="text-2xl font-semibold" />
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

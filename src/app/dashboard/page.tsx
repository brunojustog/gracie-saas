import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";
import { parseDashboardFilters } from "@/lib/analytics-filters";
import {
  type PeriodPreset,
  resolveCustom,
  resolvePreset,
  variationPct,
} from "@/lib/period";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/server/auth";
import { getDashboardData } from "@/server/analytics";
import { getDueOverview, type DueRow } from "@/server/payments";

import { CollectionNotesButton } from "./collection-notes";
import { getPdvKpis } from "@/server/pdv";
import { requireTenantUser } from "@/server/tenant";

import {
  ConversionByOriginChart,
  ConversionFunnelChart,
  FunnelChart,
  LeadsByDayChart,
  ModalityPie,
  StagnatedByStageChart,
} from "./charts";
import { DashboardFilters } from "./dashboard-filters";
import { PeriodFilter } from "./period-filter";

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
  origin?: string;
  modality?: string;
  seller?: string;
  tag?: string;
}>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, user, membership } = await requireTenantUser();
  const sp = await searchParams;

  const customPeriod = sp.from && sp.to ? resolveCustom(sp.from, sp.to) : null;
  // Default: "last_30_days" em vez de "this_month" — evita dashboard vazia
  // logo no início do mês ou pra tenants cujos eventos relevantes caíram no
  // mês anterior.
  const preset: PeriodPreset = VALID_PRESETS.includes(sp.period as PeriodPreset)
    ? (sp.period as PeriodPreset)
    : "last_30_days";
  const period = customPeriod ?? resolvePreset(preset);
  const currentSelector: PeriodPreset | "custom" = customPeriod ? "custom" : preset;

  const filters = parseDashboardFilters({
    origin: sp.origin,
    modality: sp.modality,
    seller: sp.seller,
    tag: sp.tag,
  });
  const isSeller = membership.role === "SELLER";

  const [data, pdv, dueOverview, modalitiesForFilter, sellersForFilter, tagsRaw] =
    await Promise.all([
      getDashboardData(membership, period, filters),
      getPdvKpis(membership, { start: period.from, end: period.to }),
      // Vencimentos não respeitam o filtro de período — são sempre "hoje".
      getDueOverview(membership, 7),
      prisma.modality.findMany({
        where: { tenantId: tenant.id, active: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true },
      }),
      isSeller
        ? Promise.resolve([])
        : prisma.tenantUser.findMany({
            where: { tenantId: tenant.id, role: "SELLER", active: true },
            include: { user: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: "asc" },
          }),
      // Tags pra dropdown — agrega únicas usando raw (Prisma não tem
      // groupBy em array fields). Limita às tags realmente em uso.
      prisma.$queryRaw<Array<{ tag: string }>>`
        SELECT DISTINCT unnest("tags") AS tag
        FROM "Lead"
        WHERE "tenantId" = ${tenant.id}
        ORDER BY tag
      `,
    ]);

  const modalityOptions = modalitiesForFilter.map((m) => ({
    value: m.id,
    label: m.name,
  }));
  const sellerOptions = isSeller
    ? []
    : sellersForFilter.map((s) => ({
        value: s.user.id,
        label: s.user.name ?? s.user.email,
      }));
  const tagOptions = tagsRaw.map((r) => r.tag).filter(Boolean);

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium text-muted-foreground">
            {period.label}
          </h2>
          <PeriodFilter current={currentSelector} from={sp.from} to={sp.to} />
        </div>

        <DashboardFilters
          modalities={modalityOptions}
          sellers={sellerOptions}
          tags={tagOptions}
          current={{
            origin: filters.origin,
            modality: filters.modalityId,
            seller: filters.sellerId,
            tag: filters.tag,
          }}
        />

        {/* 1) KPIs operacionais — o que pulsa diariamente */}
        <KPICards data={data} isSeller={data.isSeller} />

        {/* 1b) Cobrança (v1.1-AB) — quem vence nos próximos dias e quem já
            venceu. Independe do filtro de período: é sempre o estado de hoje. */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Panel
            title={`Inadimplentes (${dueOverview.overdue.length})`}
            subtitle="Mensalidade vencida e não confirmada — cobrar e registrar o pagamento em Matrículas"
          >
            <DueList
              rows={dueOverview.overdue}
              emptyLabel="Nenhum aluno inadimplente. 🎉"
              hideFinancials={data.isSeller}
              overdue
              linkHref="/matriculas?due=overdue"
            />
          </Panel>
          <Panel
            title={`Próximos vencimentos (${dueOverview.upcoming.length})`}
            subtitle={`Mensalidades que vencem em até ${dueOverview.horizonDays} dias`}
          >
            <DueList
              rows={dueOverview.upcoming}
              emptyLabel="Nada vencendo nos próximos dias."
              hideFinancials={data.isSeller}
              linkHref="/matriculas?due=due7"
            />
          </Panel>
        </section>

        {/* 2) Funil de conversão + leads por dia — saúde do pipeline */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="Funil de conversão"
            subtitle="Jornada da coorte de leads que entrou no período"
          >
            <ConversionFunnelChart data={data.conversionFunnel} />
          </Panel>
          <Panel title="Novos leads por dia" subtitle="Volume de captação no período">
            <LeadsByDayChart data={data.leadsByDay} />
          </Panel>
        </section>

        {/* 3) Onde focar atenção — origens que convertem + gargalos parados */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="Conversão por origem"
            subtitle="Canais de entrada do lead — quais convertem melhor"
          >
            <ConversionByOriginChart data={data.conversionByOrigin} />
          </Panel>
          <Panel
            title={`Leads parados (> ${data.stagnatedDays} dias)`}
            subtitle="Sem interação registrada — gargalos no funil"
          >
            <StagnatedByStageChart
              data={data.stagnatedByStage}
              daysThreshold={data.stagnatedDays}
            />
          </Panel>
        </section>

        {/* 4) Estado atual do funil + mix de modalidades */}
        <section className="grid gap-4 lg:grid-cols-2">
          <Panel
            title="Distribuição por estágio"
            subtitle="Onde os leads do período estão atualmente"
          >
            <FunnelChart data={data.funnel} />
          </Panel>
          <Panel title="Matrículas ativas por modalidade">
            <ModalityPie data={data.byModality} />
          </Panel>
        </section>

        {/* 5) Ranking de vendedoras + PDV — visão de performance/receita */}
        <section className="grid gap-4 lg:grid-cols-2">
          {!data.isSeller && data.ranking.length > 0 ? (
            <Panel title="Ranking de vendedoras (período)">
              <SellerRanking ranking={data.ranking} />
            </Panel>
          ) : (
            <Panel title="Resumo do período">
              <PeriodSummary data={data} />
            </Panel>
          )}
          <Panel
            title="Lojinha (período)"
            subtitle={
              data.isSeller
                ? "Volume das suas vendas"
                : "Receita e ranking de vendas no PDV"
            }
          >
            <PdvSummary kpis={pdv} isSeller={data.isSeller} />
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
        {subtitle ? (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

/**
 * Lista compacta de vencimentos (dashboard). Mostra até 10 e linka pra
 * /matriculas com o filtro correspondente pra ver/cobrar o resto.
 */
function DueList({
  rows,
  emptyLabel,
  hideFinancials,
  overdue = false,
  linkHref,
}: {
  rows: DueRow[];
  emptyLabel: string;
  hideFinancials: boolean;
  overdue?: boolean;
  linkHref: string;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }
  const visible = rows.slice(0, 10);
  return (
    <div className="space-y-1">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-xs uppercase text-muted-foreground">
            <th className="px-2 py-1.5 text-left font-medium">Aluno</th>
            <th className="px-2 py-1.5 text-left font-medium">Plano</th>
            <th className="px-2 py-1.5 text-right font-medium">Vencimento</th>
            {hideFinancials ? null : (
              <th className="px-2 py-1.5 text-right font-medium">Valor</th>
            )}
            {overdue ? (
              <th className="px-2 py-1.5 text-right font-medium">Cobrança</th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {visible.map((r) => (
            <tr key={r.enrollmentId} className="border-b last:border-0">
              <td className="px-2 py-1.5">
                <div className="font-medium">{r.leadName}</div>
                {r.leadPhone ? (
                  <div className="text-[11px] text-muted-foreground">{r.leadPhone}</div>
                ) : null}
              </td>
              <td className="px-2 py-1.5 text-muted-foreground">
                {r.planName}
                <span className="text-[11px]"> · {r.modalityName}</span>
              </td>
              <td className="px-2 py-1.5 text-right">
                <span className={overdue ? "font-medium text-red-700 dark:text-red-300" : ""}>
                  {r.nextDueDate.toLocaleDateString("pt-BR")}
                </span>
                {overdue ? (
                  <div className="text-[11px] text-red-700/80 dark:text-red-300/80">
                    há {r.daysOverdue}d
                  </div>
                ) : null}
              </td>
              {hideFinancials ? null : (
                <td className="px-2 py-1.5 text-right font-mono text-xs">
                  {(r.monthlyValue ?? 0).toLocaleString("pt-BR", {
                    style: "currency",
                    currency: "BRL",
                  })}
                </td>
              )}
              {overdue ? (
                <td className="px-2 py-1.5 text-right">
                  <CollectionNotesButton
                    enrollmentId={r.enrollmentId}
                    leadName={r.leadName}
                  />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between pt-1">
        {rows.length > visible.length ? (
          <span className="text-[11px] text-muted-foreground">
            +{rows.length - visible.length} não exibido{rows.length - visible.length === 1 ? "" : "s"}
          </span>
        ) : (
          <span />
        )}
        <a href={linkHref} className="text-[11px] font-medium text-primary hover:underline">
          Ver em Matrículas →
        </a>
      </div>
    </div>
  );
}

function formatResponseTime(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  if (seconds < 86400) {
    const h = seconds / 3600;
    return `${h.toFixed(h < 10 ? 1 : 0)}h`;
  }
  return `${(seconds / 86400).toFixed(1)}d`;
}

function KPICards({
  data,
  isSeller,
}: {
  data: Awaited<ReturnType<typeof getDashboardData>>;
  isSeller: boolean;
}) {
  const { kpis } = data;
  // Layout: pra ADMIN/MANAGER são 7 KPIs (cabe em 4+3 nos breakpoints xl).
  // Pra SELLER são 6 (sem receita). Em sm/lg cresce em colunas menores.
  return (
    <section
      className={`grid gap-3 sm:grid-cols-2 lg:grid-cols-3 ${
        isSeller ? "xl:grid-cols-6" : "xl:grid-cols-7"
      }`}
    >
      <KPI
        label="Leads novos"
        value={kpis.leadsNew.current}
        previous={kpis.leadsNew.previous}
      />
      <KPI
        label="Tempo de resposta"
        value={kpis.avgFirstResponseSeconds}
        formatRaw={formatResponseTime}
        hint="média até 1ª ação no lead"
      />
      <KPI
        label="Aulas agendadas"
        value={kpis.classesScheduled.current}
        previous={kpis.classesScheduled.previous}
      />
      <KPI
        label="Comparecimentos"
        value={kpis.attended.current}
        previous={kpis.attended.previous}
      />
      <KPI
        label="Matrículas"
        value={kpis.enrollments.current}
        previous={kpis.enrollments.previous}
      />
      <KPI
        label="Conversão"
        value={kpis.conversionPct}
        previous={kpis.conversionPrevPct}
        format="percent"
        hint="matrículas ÷ leads no período"
      />
      {isSeller ? null : (
        <KPI
          label="Receita mensal"
          value={kpis.monthlyRevenue}
          format="currency"
          hint="todas as matrículas ativas"
        />
      )}
    </section>
  );
}

function KPI({
  label,
  value,
  previous,
  format = "number",
  formatRaw,
  hint,
}: {
  label: string;
  value: number | null;
  previous?: number | null;
  format?: "number" | "currency" | "percent";
  formatRaw?: (v: number | null) => string;
  hint?: string;
}) {
  const display = formatRaw
    ? formatRaw(value)
    : value === null
      ? "—"
      : format === "currency"
        ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
        : format === "percent"
          ? `${value.toFixed(1)}%`
          : value.toString();

  const variation =
    typeof previous === "number" && typeof value === "number"
      ? variationPct(value, previous)
      : null;

  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold leading-tight">{display}</div>
      <div className="mt-1 text-[11px] text-muted-foreground">
        {variation === null ? (
          hint ?? <span>&nbsp;</span>
        ) : (
          <span
            className={
              variation > 0
                ? "text-emerald-600"
                : variation < 0
                  ? "text-red-600"
                  : ""
            }
          >
            {variation > 0 ? "▲" : variation < 0 ? "▼" : "·"}{" "}
            {Math.abs(variation).toFixed(0)}% vs período anterior
          </span>
        )}
      </div>
    </div>
  );
}

function SellerRanking({
  ranking,
}: {
  ranking: Array<{
    userId: string;
    name: string;
    leads: number;
    matriculas: number;
    conversion: number;
    revenue: number;
  }>;
}) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b text-xs uppercase text-muted-foreground">
          <th className="px-2 py-2 text-left font-medium">Vendedora</th>
          <th className="px-2 py-2 text-right font-medium">Leads</th>
          <th className="px-2 py-2 text-right font-medium">Matr.</th>
          <th className="px-2 py-2 text-right font-medium">Conv.</th>
          <th className="px-2 py-2 text-right font-medium">Receita</th>
        </tr>
      </thead>
      <tbody>
        {ranking.map((r) => (
          <tr key={r.userId} className="border-b last:border-0">
            <td className="px-2 py-2 font-medium">{r.name}</td>
            <td className="px-2 py-2 text-right">{r.leads}</td>
            <td className="px-2 py-2 text-right">{r.matriculas}</td>
            <td className="px-2 py-2 text-right">
              {(r.conversion * 100).toFixed(0)}%
            </td>
            <td className="px-2 py-2 text-right font-mono text-xs">
              {r.revenue.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PdvSummary({
  kpis,
  isSeller,
}: {
  kpis: Awaited<ReturnType<typeof getPdvKpis>>;
  isSeller: boolean;
}) {
  const fmtBRL = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  return (
    <div className="space-y-3 text-sm">
      <div className={`grid gap-3 ${isSeller ? "grid-cols-1" : "grid-cols-2"}`}>
        {isSeller ? null : (
          <div className="rounded border bg-muted/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Receita
            </div>
            <div className="mt-0.5 text-xl font-semibold">{fmtBRL(kpis.revenue)}</div>
          </div>
        )}
        <div className="rounded border bg-muted/40 p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Vendas
          </div>
          <div className="mt-0.5 text-xl font-semibold">{kpis.salesCount}</div>
        </div>
      </div>

      {kpis.sellerRanking.length > 0 ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b text-[10px] uppercase text-muted-foreground">
              <th className="px-1 py-1.5 text-left font-medium">Vendedora</th>
              <th className="px-1 py-1.5 text-right font-medium">Vendas</th>
              {isSeller ? null : (
                <th className="px-1 py-1.5 text-right font-medium">Total</th>
              )}
            </tr>
          </thead>
          <tbody>
            {kpis.sellerRanking.map((r) => (
              <tr key={r.sellerUserId} className="border-b last:border-0">
                <td className="px-1 py-1.5 font-medium">{r.sellerName}</td>
                <td className="px-1 py-1.5 text-right">{r.count}</td>
                {isSeller ? null : (
                  <td className="px-1 py-1.5 text-right font-mono">
                    {fmtBRL(r.total)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-muted-foreground">
          Nenhuma venda no período.
        </p>
      )}
    </div>
  );
}

function PeriodSummary({
  data,
}: {
  data: Awaited<ReturnType<typeof getDashboardData>>;
}) {
  const { kpis, period, previous } = data;
  return (
    <dl className="space-y-2 text-sm">
      <div className="flex justify-between border-b pb-1">
        <dt className="text-muted-foreground">Período</dt>
        <dd className="font-medium">{period.label}</dd>
      </div>
      <div className="flex justify-between border-b pb-1">
        <dt className="text-muted-foreground">Comparado a</dt>
        <dd className="font-medium">{previous.label}</dd>
      </div>
      {data.isSeller ? (
        <p className="pt-2 text-xs text-muted-foreground">
          Você está vendo somente os números dos seus leads.
        </p>
      ) : (
        <div className="flex justify-between border-b pb-1">
          <dt className="text-muted-foreground">Receita ativa hoje</dt>
          <dd className="font-mono font-medium">
            {kpis.monthlyRevenue.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </dd>
        </div>
      )}
    </dl>
  );
}

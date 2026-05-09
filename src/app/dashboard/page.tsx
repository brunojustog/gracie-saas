import { Calendar, GraduationCap, Kanban, Settings } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { type PeriodPreset, resolvePreset, variationPct } from "@/lib/period";
import { signOut } from "@/server/auth";
import { getDashboardData } from "@/server/analytics";
import { requireTenantUser } from "@/server/tenant";

import { FunnelChart, LeadsByDayChart, ModalityPie } from "./charts";
import { PeriodFilter } from "./period-filter";

const VALID_PRESETS: PeriodPreset[] = [
  "this_month",
  "last_month",
  "last_7_days",
  "last_30_days",
];

type SearchParams = Promise<{ period?: string }>;

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, user, membership } = await requireTenantUser();
  const sp = await searchParams;

  const preset: PeriodPreset = VALID_PRESETS.includes(sp.period as PeriodPreset)
    ? (sp.period as PeriodPreset)
    : "this_month";
  const period = resolvePreset(preset);

  const data = await getDashboardData(membership, period);

  return (
    <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="h-10 w-10 rounded-md"
            style={{ background: tenant.primaryColor }}
            aria-hidden
          />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">{tenant.name}</h1>
            <p className="text-xs text-muted-foreground">
              {user.email}
              <span className="ml-2 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                {membership.role.toLowerCase()}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/kanban">
            <Button variant="outline" size="sm">
              <Kanban className="mr-1.5 h-4 w-4" /> Kanban
            </Button>
          </Link>
          <Link href="/aulas">
            <Button variant="outline" size="sm">
              <Calendar className="mr-1.5 h-4 w-4" /> Aulas
            </Button>
          </Link>
          <Link href="/matriculas">
            <Button variant="outline" size="sm">
              <GraduationCap className="mr-1.5 h-4 w-4" /> Matrículas
            </Button>
          </Link>
          {membership.role === "ADMIN" ? (
            <Link href="/settings">
              <Button variant="outline" size="sm">
                <Settings className="mr-1.5 h-4 w-4" /> Config
              </Button>
            </Link>
          ) : null}
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="ghost" size="sm">
              Sair
            </Button>
          </form>
        </div>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-muted-foreground">{period.label}</h2>
        <PeriodFilter current={preset} />
      </div>

      <KPICards data={data} />

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Funil de leads" subtitle="Leads novos no período por estágio">
          <FunnelChart data={data.funnel} />
        </Panel>
        <Panel title="Novos leads por dia" subtitle="Volume de captação no período">
          <LeadsByDayChart data={data.leadsByDay} />
        </Panel>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Panel title="Matrículas ativas por modalidade">
          <ModalityPie data={data.byModality} />
        </Panel>
        {!data.isSeller && data.ranking.length > 0 ? (
          <Panel title="Ranking de vendedoras (período)">
            <SellerRanking ranking={data.ranking} />
          </Panel>
        ) : (
          <Panel title="Resumo do período">
            <PeriodSummary data={data} />
          </Panel>
        )}
      </section>
    </main>
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

function KPICards({ data }: { data: Awaited<ReturnType<typeof getDashboardData>> }) {
  const { kpis } = data;
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KPI
        label="Leads novos"
        value={kpis.leadsNew.current}
        previous={kpis.leadsNew.previous}
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
        label="Receita mensal"
        value={kpis.monthlyRevenue}
        format="currency"
        hint="todas as matrículas ativas"
      />
      <KPI
        label="Conversão"
        value={kpis.conversionPct}
        previous={kpis.conversionPrevPct}
        format="percent"
        hint="matrículas ÷ leads no período"
      />
    </section>
  );
}

function KPI({
  label,
  value,
  previous,
  format = "number",
  hint,
}: {
  label: string;
  value: number | null;
  previous?: number | null;
  format?: "number" | "currency" | "percent";
  hint?: string;
}) {
  const display =
    value === null
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
      <div className="flex justify-between border-b pb-1">
        <dt className="text-muted-foreground">Receita ativa hoje</dt>
        <dd className="font-mono font-medium">
          {kpis.monthlyRevenue.toLocaleString("pt-BR", {
            style: "currency",
            currency: "BRL",
          })}
        </dd>
      </div>
      {data.isSeller ? (
        <p className="pt-2 text-xs text-muted-foreground">
          Você está vendo somente os números dos seus leads.
        </p>
      ) : null}
    </dl>
  );
}

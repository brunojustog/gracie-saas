import type { ExperimentalClassStatus } from "@prisma/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";
import { signOut } from "@/server/auth";
import { getQuadroData } from "@/server/quadro";
import { requireRole } from "@/server/tenant";

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

export default async function QuadroPage() {
  // Admin-only. requireRole redireciona quem não for ADMIN pra /dashboard.
  const { tenant, user, membership } = await requireRole("ADMIN");
  const data = await getQuadroData(tenant.id);

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
                <Row label="Total de alunos ativos" value={data.matriculas.totalActive} strong />
                <Row
                  label="Ativos inadimplentes"
                  value={data.matriculas.overdue}
                  hint="estão dentro do total acima"
                  tone={data.matriculas.overdue > 0 ? "red" : undefined}
                />
                <Spacer />
                <Row label="Total adultos" value={data.matriculas.adults.total} strong />
                <Row label="Mulheres" value={data.matriculas.adults.female} indent />
                <Row label="Homens" value={data.matriculas.adults.male} indent />
                {data.matriculas.adults.unknown > 0 ? (
                  <Row label="Sem gênero informado" value={data.matriculas.adults.unknown} indent muted />
                ) : null}
                <Spacer />
                <Row label="Total kids" value={data.matriculas.kids.total} strong />
                <Row label="Meninas" value={data.matriculas.kids.female} indent />
                <Row label="Meninos" value={data.matriculas.kids.male} indent />
                {data.matriculas.kids.unknown > 0 ? (
                  <Row label="Sem gênero informado" value={data.matriculas.kids.unknown} indent muted />
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
                rows={data.planos.map((p) => ({ label: p.name, value: p.count }))}
                emptyLabel="Nenhuma matrícula ativa."
              />
            </Panel>
            <Panel title="Pagamento" subtitle="Matrículas ativas por forma de pagamento">
              <KeyValueList
                rows={data.pagamento.map((p) => ({
                  label: PAYMENT_LABEL[p.method] ?? p.method,
                  value: p.count,
                }))}
                emptyLabel="Nenhuma matrícula ativa."
              />
            </Panel>
            <Panel title="Cancelamentos">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-semibold">{data.cancelamentos}</span>
                <span className="text-xs text-muted-foreground">
                  total na vida da academia
                </span>
              </div>
            </Panel>
          </div>
        </section>

        {/* 4 + 6) Crescimento e churn mês a mês */}
        <Panel
          title="Crescimento e churn (mês a mês)"
          subtitle="Alunos ativos no 1º dia de cada mês, novas matrículas, cancelamentos e churn"
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-muted-foreground">
                  <th className="px-2 py-2 text-left font-medium">Mês</th>
                  <th className="px-2 py-2 text-right font-medium">Ativos no início</th>
                  <th className="px-2 py-2 text-right font-medium">Novas matrículas</th>
                  <th className="px-2 py-2 text-right font-medium">Cancelamentos</th>
                  <th className="px-2 py-2 text-right font-medium">Churn</th>
                </tr>
              </thead>
              <tbody>
                {data.growth.map((m) => (
                  <tr key={m.label} className="border-b last:border-0">
                    <td className="px-2 py-2 font-medium capitalize">{m.label}</td>
                    <td className="px-2 py-2 text-right">{m.activeStart}</td>
                    <td className="px-2 py-2 text-right text-emerald-700 dark:text-emerald-300">
                      +{m.newInMonth}
                    </td>
                    <td className="px-2 py-2 text-right text-red-700 dark:text-red-300">
                      −{m.canceledInMonth}
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
          subtitle="Produtividade nos últimos 3 meses (matrículas fechadas)"
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
                        <td key={i} className="px-2 py-2 text-right">{c}</td>
                      ))}
                      <td className="px-2 py-2 text-right font-semibold">{s.total}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
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
              <span className="text-3xl font-semibold">{data.posExperimental.length}</span>
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
}: {
  label: string;
  value: number;
  strong?: boolean;
  indent?: boolean;
  muted?: boolean;
  hint?: string;
  tone?: "red";
}) {
  return (
    <tr className="border-b last:border-0">
      <td className={`py-1.5 ${indent ? "pl-4" : ""} ${strong ? "font-semibold" : ""} ${muted ? "text-muted-foreground" : ""}`}>
        {label}
        {hint ? <span className="ml-1 text-[11px] text-muted-foreground">({hint})</span> : null}
      </td>
      <td className={`py-1.5 text-right tabular-nums ${strong ? "font-semibold" : ""} ${tone === "red" ? "text-red-700 dark:text-red-300" : ""}`}>
        {value}
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
  rows: Array<{ label: string; value: number }>;
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
            <td className="py-1.5 text-right font-medium tabular-nums">{r.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
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

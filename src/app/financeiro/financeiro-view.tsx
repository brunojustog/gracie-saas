"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Money } from "@/components/money";
import { cn } from "@/lib/utils";
import type { FinancialOverview, FinancialRow, FinancialStatus } from "@/server/financial";

type Filter = "all" | FinancialStatus;

function shiftMonth(ref: string, delta: number): string {
  const [y, m] = ref.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const STATUS_META: Record<FinancialStatus, { label: string; dot: string; text: string }> = {
  paid: { label: "Pago", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  due: { label: "No prazo", dot: "bg-amber-400", text: "text-amber-700 dark:text-amber-400" },
  overdue: { label: "Inadimplente", dot: "bg-red-500", text: "text-red-700 dark:text-red-400" },
};

export function FinanceiroView({ overview }: { overview: FinancialOverview }) {
  const [filter, setFilter] = useState<Filter>("all");

  const prevMonth = shiftMonth(overview.monthRef, -1);
  const nextMonth = shiftMonth(overview.monthRef, 1);

  const rows = useMemo(() => {
    if (filter === "all") return overview.rows;
    return overview.rows.filter((r) => r.status === filter);
  }, [overview.rows, filter]);

  return (
    <div className="space-y-4">
      {/* Navegação de mês */}
      <div className="flex items-center justify-center gap-3">
        <Link
          href={`/financeiro?month=${prevMonth}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </Link>
        <span className="min-w-44 text-center text-sm font-medium capitalize">
          {overview.monthLabel}
        </span>
        <Link
          href={`/financeiro?month=${nextMonth}`}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted"
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Previsto × recebido */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Previsto</div>
          <div className="mt-1 text-2xl font-semibold">
            <Money value={overview.previsto} />
          </div>
          <div className="text-[11px] text-muted-foreground">mensalidades das matrículas ativas</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Recebido</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-400">
            <Money value={overview.recebido} />
          </div>
          <div className="text-[11px] text-muted-foreground">
            baixas registradas no mês ·{" "}
            {overview.previsto > 0
              ? `${Math.round((overview.recebido / overview.previsto) * 100)}% do previsto`
              : "—"}
          </div>
        </div>
      </div>

      {/* Semáforo clicável */}
      <div className="grid grid-cols-4 gap-2">
        <CountChip active={filter === "all"} onClick={() => setFilter("all")} label="Todas" count={overview.rows.length} tone="neutral" />
        <CountChip active={filter === "paid"} onClick={() => setFilter(filter === "paid" ? "all" : "paid")} label="Pagas" count={overview.pagosCount} tone="green" />
        <CountChip active={filter === "due"} onClick={() => setFilter(filter === "due" ? "all" : "due")} label="No prazo" count={overview.naoPagosCount - overview.overdueCount} tone="amber" />
        <CountChip active={filter === "overdue"} onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")} label="Inadimplentes" count={overview.overdueCount} tone="red" />
      </div>

      {/* Lista */}
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma matrícula nesta situação.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Aluno</th>
                <th className="px-3 py-2 text-left font-medium">Plano</th>
                <th className="px-3 py-2 text-right font-medium">Vencimento</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2 text-right font-medium">Situação</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <Row key={r.enrollmentId} r={r} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-muted-foreground">
        Semáforo: <b>verde</b> pago no mês · <b>âmbar</b> ainda no prazo ·{" "}
        <b>vermelho</b> vencido além da carência. Regras de corte/multa serão
        aplicadas depois (a definir).
      </p>
    </div>
  );
}

function CountChip({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone: "neutral" | "green" | "amber" | "red";
}) {
  const toneCls =
    tone === "green"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "red"
          ? "text-red-700 dark:text-red-400"
          : "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card px-3 py-2 text-center transition-colors hover:bg-muted/50",
        active && "ring-2 ring-primary",
      )}
    >
      <div className={cn("text-xl font-semibold tabular-nums", toneCls)}>{count}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </button>
  );
}

function Row({ r }: { r: FinancialRow }) {
  const meta = STATUS_META[r.status];
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">
        <div className="font-medium">{r.leadName}</div>
        {r.payerName ? (
          <div className="text-[11px] text-muted-foreground">
            resp.: <span className="font-medium text-foreground">{r.payerName}</span>
          </div>
        ) : null}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {r.planName}
        <span className="text-[11px]"> · {r.modalityName}</span>
      </td>
      <td className="px-3 py-2 text-right">
        {r.paid && r.paidAt ? (
          <span className="text-emerald-700 dark:text-emerald-400">
            pago {r.paidAt.toLocaleDateString("pt-BR")}
          </span>
        ) : r.nextDueDate ? (
          <span className={r.status === "overdue" ? "font-medium text-red-700 dark:text-red-400" : ""}>
            {r.nextDueDate.toLocaleDateString("pt-BR")}
            {r.status === "overdue" ? (
              <span className="block text-[11px]">há {r.daysOverdue}d</span>
            ) : null}
          </span>
        ) : (
          "—"
        )}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs">
        <Money value={r.paid && r.paidAmount != null ? r.paidAmount : r.monthlyValue} />
      </td>
      <td className="px-3 py-2 text-right">
        {r.status === "paid" ? (
          <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", meta.text)}>
            <span className={cn("h-2 w-2 rounded-full", meta.dot)} /> {meta.label}
          </span>
        ) : (
          <Link
            href={`/matriculas?due=${r.status === "overdue" ? "overdue" : "due7"}`}
            className={cn("inline-flex items-center gap-1.5 text-xs font-medium hover:underline", meta.text)}
            title="Ir para Matrículas registrar o pagamento"
          >
            <span className={cn("h-2 w-2 rounded-full", meta.dot)} /> {meta.label}
          </Link>
        )}
      </td>
    </tr>
  );
}

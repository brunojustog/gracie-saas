/**
 * Helpers de período usados pelo dashboard de KPIs.
 * Funções puras — testáveis em isolamento.
 */
import {
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  subDays,
  subMonths,
} from "date-fns";

export type PeriodPreset = "this_month" | "last_month" | "last_7_days" | "last_30_days";

export type Period = {
  from: Date;
  to: Date;
  /** Identificador da preset usada (ou "custom"). */
  preset: PeriodPreset | "custom";
  label: string;
};

/** Resolve uma preset relativa a `now` em [from, to]. */
export function resolvePreset(preset: PeriodPreset, now: Date = new Date()): Period {
  switch (preset) {
    case "this_month":
      return {
        from: startOfMonth(now),
        to: endOfDay(now),
        preset,
        label: "Mês atual",
      };
    case "last_month": {
      const prev = subMonths(now, 1);
      return {
        from: startOfMonth(prev),
        to: endOfMonth(prev),
        preset,
        label: "Mês anterior",
      };
    }
    case "last_7_days":
      return {
        from: startOfDay(subDays(now, 6)),
        to: endOfDay(now),
        preset,
        label: "Últimos 7 dias",
      };
    case "last_30_days":
      return {
        from: startOfDay(subDays(now, 29)),
        to: endOfDay(now),
        preset,
        label: "Últimos 30 dias",
      };
  }
}

/**
 * Período anterior comparável: mesmo número de dias imediatamente antes
 * de `from`. Usado pra calcular variação %.
 */
export function previousPeriod(p: Period): Period {
  const durationMs = p.to.getTime() - p.from.getTime();
  return {
    from: new Date(p.from.getTime() - durationMs - 1),
    to: new Date(p.from.getTime() - 1),
    preset: "custom",
    label: `${p.label} (anterior)`,
  };
}

/**
 * Variação relativa entre `current` e `previous`. Retorna `null` quando
 * `previous === 0` (divisão por zero — nesse caso o caller mostra "—" ou "novo").
 */
export function variationPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

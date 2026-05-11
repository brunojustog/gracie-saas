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

/**
 * Resolve um período custom [from, to] (datas inclusive).
 * Datas vêm como "YYYY-MM-DD" do query string — aceitamos null em qualquer extremo.
 */
export function resolveCustom(fromStr: string, toStr: string): Period | null {
  const fromMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fromStr);
  const toMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(toStr);
  if (!fromMatch || !toMatch) return null;
  const from = startOfDay(
    new Date(Number(fromMatch[1]), Number(fromMatch[2]) - 1, Number(fromMatch[3])),
  );
  const to = endOfDay(
    new Date(Number(toMatch[1]), Number(toMatch[2]) - 1, Number(toMatch[3])),
  );
  if (from > to) return null;
  return {
    from,
    to,
    preset: "custom",
    label: `${fromMatch[3]}/${fromMatch[2]}/${fromMatch[1]} → ${toMatch[3]}/${toMatch[2]}/${toMatch[1]}`,
  };
}

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

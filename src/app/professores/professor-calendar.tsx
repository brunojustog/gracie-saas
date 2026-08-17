/**
 * v1.1-CI: calendário mensal das aulas dadas por UM professor no período.
 * Server component (só exibição). Cada dia mostra as aulas confirmadas com
 * a modalidade; cores distinguem regular / auxílio / particular / experimental.
 */
import {
  eachDayOfInterval,
  endOfWeek,
  format,
  isSameMonth,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";

import type { ProfCalEntry, ProfCalKind } from "@/server/professor-classes";

const KIND_LABEL: Record<ProfCalKind, string> = {
  regular: "Regular / Kids",
  aux: "Auxílio",
  particular: "Particular",
  experimental: "Experimental",
};

// Ponto colorido por tipo de aula (borda esquerda do item).
const KIND_DOT: Record<ProfCalKind, string> = {
  regular: "bg-emerald-500",
  aux: "bg-violet-500",
  particular: "bg-amber-500",
  experimental: "bg-teal-500",
};

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

export function ProfessorCalendar({
  from,
  to,
  byDay,
}: {
  from: Date;
  to: Date;
  byDay: Record<string, ProfCalEntry[]>;
}) {
  // Cobre semanas inteiras (Seg→Dom) que tocam o período.
  const gridStart = startOfWeek(from, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(to, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  // Mês de referência = o mês do início do período (pra escurecer dias de fora).
  const refMonth = from;

  return (
    <div className="space-y-2">
      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
        {(Object.keys(KIND_LABEL) as ProfCalKind[]).map((k) => (
          <span key={k} className="flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${KIND_DOT[k]}`} />
            {KIND_LABEL[k]}
          </span>
        ))}
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          {/* Cabeçalho dos dias da semana */}
          <div className="grid grid-cols-7 gap-1 pb-1">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="text-center text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {w}
              </div>
            ))}
          </div>

          {/* Células */}
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const key = format(d, "yyyy-MM-dd");
              const entries = byDay[key] ?? [];
              const inRange = d >= from && d <= to;
              const outMonth = !isSameMonth(d, refMonth);
              return (
                <div
                  key={key}
                  className={`min-h-[76px] rounded-md border p-1 ${
                    outMonth || !inRange
                      ? "bg-muted/30 text-muted-foreground/60"
                      : "bg-card"
                  } ${entries.length > 0 ? "border-primary/40" : ""}`}
                >
                  <div className="flex items-center justify-between px-0.5">
                    <span className="text-[10px] font-medium tabular-nums">
                      {format(d, "d")}
                    </span>
                    {entries.length > 0 ? (
                      <span className="rounded-full bg-primary/10 px-1 text-[9px] font-bold text-primary tabular-nums">
                        {entries.length}
                      </span>
                    ) : null}
                  </div>
                  <ul className="mt-0.5 space-y-0.5">
                    {entries.map((e, i) => (
                      <li
                        key={i}
                        title={`${e.startTime ? `${e.startTime} · ` : ""}${e.label}`}
                        className="flex items-center gap-1 rounded bg-background/60 px-0.5 text-[9.5px] leading-tight"
                      >
                        <span
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${KIND_DOT[e.kind]}`}
                        />
                        <span className="truncate">
                          {e.startTime ? (
                            <span className="text-muted-foreground">{e.startTime} </span>
                          ) : null}
                          {e.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {format(from, "dd/MM", { locale: ptBR })} →{" "}
        {format(to, "dd/MM", { locale: ptBR })} · só aulas confirmadas (dadas).
      </p>
    </div>
  );
}

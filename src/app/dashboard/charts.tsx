"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type FunnelEntry = {
  stageId: string;
  name: string;
  color: string;
  isWon: boolean;
  count: number;
};

type ModalityEntry = {
  modalityId: string;
  name: string;
  color: string;
  count: number;
};

type LeadDayEntry = { day: Date | string; count: number };

export function FunnelChart({ data }: { data: FunnelEntry[] }) {
  if (data.every((d) => d.count === 0)) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sem leads no período.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 32)}>
      <BarChart data={data} layout="vertical" margin={{ left: 100, right: 24 }}>
        <CartesianGrid horizontal={false} stroke="#e5e7eb" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
        <YAxis
          dataKey="name"
          type="category"
          tick={{ fontSize: 11 }}
          width={100}
        />
        <Tooltip
          formatter={(v) => {
            const n = Number(v);
            return [`${n} lead${n === 1 ? "" : "s"}`, "Quantidade"];
          }}
        />
        <Bar dataKey="count" radius={[0, 4, 4, 0]}>
          {data.map((d) => (
            <Cell key={d.stageId} fill={d.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LeadsByDayChart({ data }: { data: LeadDayEntry[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sem leads no período.
      </p>
    );
  }
  const formatted = data.map((d) => ({
    day: format(new Date(d.day), "dd/MM", { locale: ptBR }),
    count: d.count,
  }));
  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={formatted} margin={{ left: 0, right: 8, top: 8 }}>
        <CartesianGrid stroke="#e5e7eb" />
        <XAxis dataKey="day" tick={{ fontSize: 11 }} />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} width={28} />
        <Tooltip />
        <Line
          type="monotone"
          dataKey="count"
          stroke="#C8102E"
          strokeWidth={2}
          dot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

type ConversionStep = {
  label: string;
  count: number;
  /** % da etapa anterior. Null pra primeira (Leads). */
  fromPreviousPct: number | null;
};

/**
 * Funil de conversão "cascata": Leads → Agendaram → Compareceram → Matricularam.
 * Cada nível tem:
 *   - Barra horizontal proporcional ao topo (cohort total) → vê quão fundo
 *     o funil afunila comparado à entrada
 *   - Label "▼ X%" entre níveis → taxa de conversão do anterior pro atual
 */
export function ConversionFunnelChart({ data }: { data: ConversionStep[] }) {
  const top = data[0]?.count ?? 0;
  if (top === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sem leads no período.
      </p>
    );
  }
  return (
    <div className="space-y-1.5">
      {data.map((step, i) => {
        const overallPct = top > 0 ? (step.count / top) * 100 : 0;
        return (
          <div key={step.label}>
            {i > 0 ? (
              <div className="flex items-center justify-center py-0.5 text-[11px] text-muted-foreground">
                <span className="inline-block">▼</span>
                <span className="ml-1">
                  {step.fromPreviousPct === null
                    ? "—"
                    : `${step.fromPreviousPct.toFixed(0)}% ${step.label.toLowerCase()}`}
                </span>
              </div>
            ) : null}
            <div className="rounded-md border bg-card p-2.5">
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-xs font-medium">{step.label}</span>
                <span className="font-mono text-lg font-semibold tabular-nums">
                  {step.count.toLocaleString("pt-BR")}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${overallPct}%` }}
                />
              </div>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {overallPct.toFixed(1)}% do topo
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function ModalityPie({ data }: { data: ModalityEntry[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Sem matrículas ativas.
      </p>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={data}
          dataKey="count"
          nameKey="name"
          innerRadius={50}
          outerRadius={80}
          paddingAngle={2}
        >
          {data.map((d) => (
            <Cell key={d.modalityId} fill={d.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(v, _name, item) => {
            const n = Number(v);
            const name = (item?.payload as ModalityEntry | undefined)?.name ?? "";
            return [`${n} matrícula${n === 1 ? "" : "s"}`, name];
          }}
        />
        <Legend
          iconSize={10}
          wrapperStyle={{ fontSize: 12 }}
          align="center"
          verticalAlign="bottom"
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

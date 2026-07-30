"use client";

import { Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import {
  confirmGridClass,
  confirmIncoming,
  confirmParticularSession,
  transferGridClass,
  unconfirmClass,
} from "./actions";

type Prof = { id: string; name: string };
type GridItem = {
  slotId: string;
  startTime: string;
  label: string;
  isKids: boolean;
  value: number;
  taught: {
    id: string;
    professorId: string;
    professorName: string;
    status: "PENDING" | "CONFIRMED";
    auxProfessorId: string | null;
    auxProfessorName: string | null;
    mine: boolean;
  } | null;
};
type Incoming = {
  id: string;
  startTime: string;
  label: string;
  isKids: boolean;
  value: number;
  status: "PENDING" | "CONFIRMED";
  auxProfessorName: string | null;
};
type Day = {
  gridItems: GridItem[];
  incoming: Incoming[];
  particulares: { sessionId: string; packageId: string; alunoNome: string }[];
  professors: Prof[];
};
type Earnings = {
  regularCount: number;
  regularValor: number;
  auxCount: number;
  auxValor: number;
  particularCount: number;
  particularValor: number;
  total: number;
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ProfessorView({
  dateISO,
  dateLabel,
  day,
  monthLabel,
  earnings,
}: {
  professorName: string;
  dateISO: string;
  dateLabel: string;
  day: Day;
  monthLabel: string;
  earnings: Earnings;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Auxiliar escolhido por aula KIDS (antes de confirmar).
  const [auxBySlot, setAuxBySlot] = useState<Record<string, string>>({});

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok?: string) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error ?? "erro");
        return;
      }
      if (ok) toast.success(ok);
      router.refresh();
    });

  const changeDate = (v: string) => router.push(`/professor?date=${v}`);

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      {/* Total do mês */}
      <div className="rounded-xl border bg-card p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          A receber em {monthLabel}
        </div>
        <div className="mt-0.5 text-3xl font-bold text-emerald-700 tabular-nums dark:text-emerald-300">
          {brl(earnings.total)}
        </div>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>{earnings.regularCount} regulares · {brl(earnings.regularValor)}</span>
          <span>{earnings.auxCount} auxílios · {brl(earnings.auxValor)}</span>
          <span>{earnings.particularCount} particulares · {brl(earnings.particularValor)}</span>
        </div>
      </div>

      {/* Seletor de dia */}
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium capitalize">{dateLabel}</h2>
        <Input
          type="date"
          value={dateISO}
          onChange={(e) => changeDate(e.target.value)}
          className="h-9 w-auto"
          disabled={pending}
        />
      </div>

      {/* Aulas transferidas pra mim */}
      {day.incoming.length > 0 ? (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-400">
            Transferidas pra você
          </h3>
          {day.incoming.map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm">
              <span className="w-14 font-mono text-xs text-muted-foreground">{t.startTime}</span>
              <span className="flex-1 font-medium">
                {t.label}
                {t.isKids ? <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] text-violet-800">KIDS</span> : null}
              </span>
              {t.status === "CONFIRMED" ? (
                <span className="text-xs text-emerald-600">✓ confirmada</span>
              ) : (
                <Button size="sm" disabled={pending} onClick={() => run(() => confirmIncoming({ taughtId: t.id, auxProfessorId: auxBySlot[t.id] || null }), "Aula confirmada")}>
                  <Check className="mr-1 h-4 w-4" /> Confirmar
                </Button>
              )}
            </div>
          ))}
        </section>
      ) : null}

      {/* Minha grade do dia */}
      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          Sua grade do dia
        </h3>
        {day.gridItems.length === 0 ? (
          <p className="rounded-lg border bg-card p-4 text-center text-xs text-muted-foreground">
            Nenhuma aula na sua grade neste dia.
          </p>
        ) : (
          day.gridItems.map((g) => {
            const done = g.taught?.mine && g.taught.status === "CONFIRMED";
            const transferredAway = g.taught && !g.taught.mine;
            return (
              <div key={g.slotId} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-14 font-mono text-xs text-muted-foreground">{g.startTime}</span>
                  <span className="flex-1 font-medium">
                    {g.label}
                    {g.isKids ? <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] text-violet-800">KIDS</span> : null}
                    <span className="ml-2 text-[11px] text-muted-foreground">{brl(g.value)}</span>
                  </span>
                  {done ? (
                    <Button size="sm" variant="secondary" disabled={pending} onClick={() => run(() => unconfirmClass({ taughtId: g.taught!.id }))}>
                      <Check className="mr-1 h-4 w-4" /> Dada
                    </Button>
                  ) : transferredAway ? (
                    <span className="text-xs text-muted-foreground">→ {g.taught!.professorName}</span>
                  ) : (
                    <Button size="sm" disabled={pending} onClick={() => run(() => confirmGridClass({ slotId: g.slotId, date: dateISO, auxProfessorId: auxBySlot[g.slotId] || null }), "Aula confirmada")}>
                      <Check className="mr-1 h-4 w-4" /> Dei a aula
                    </Button>
                  )}
                </div>
                {/* KIDS: auxiliar + transferência (quando ainda não confirmada) */}
                {!done && !transferredAway ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 pl-14">
                    {g.isKids ? (
                      <select
                        value={auxBySlot[g.slotId] ?? ""}
                        onChange={(e) => setAuxBySlot((p) => ({ ...p, [g.slotId]: e.target.value }))}
                        disabled={pending}
                        className="h-8 rounded-md border bg-background px-2 text-xs"
                      >
                        <option value="">— auxiliar (KIDS) —</option>
                        {day.professors.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    ) : null}
                    <select
                      defaultValue=""
                      onChange={(e) => {
                        const to = e.target.value;
                        e.target.value = "";
                        if (to) run(() => transferGridClass({ slotId: g.slotId, date: dateISO, toProfessorId: to }), "Aula transferida");
                      }}
                      disabled={pending}
                      className="h-8 rounded-md border bg-background px-2 text-xs text-muted-foreground"
                    >
                      <option value="">Transferir pra…</option>
                      {day.professors.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                ) : null}
                {done && g.taught?.auxProfessorName ? (
                  <div className="mt-1 pl-14 text-[11px] text-muted-foreground">
                    auxiliar: {g.taught.auxProfessorName}
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </section>

      {/* Particulares atribuídas a mim no dia */}
      {day.particulares.length > 0 ? (
        <section className="space-y-1.5">
          <h3 className="text-xs font-semibold uppercase text-muted-foreground">
            Aulas particulares suas
          </h3>
          {day.particulares.map((p) => (
            <div key={p.sessionId} className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm">
              <span className="flex-1 font-medium">{p.alunoNome}</span>
              <Button size="sm" disabled={pending} onClick={() => run(() => confirmParticularSession({ sessionId: p.sessionId }), "Aula concluída")}>
                <Check className="mr-1 h-4 w-4" /> Dei a aula
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      {pending ? (
        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> processando…
        </p>
      ) : null}
    </main>
  );
}

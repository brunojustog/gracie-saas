"use client";

import { Check, Loader2, MapPin } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AlunoSession, WeekDay } from "@/server/class-sessions";

import { checkInToSession, undoCheckIn } from "./actions";

const DIAS = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

// Cor da faixa (aproximada) pro selo. Chave = nome normalizado.
const BELT_BG: Record<string, string> = {
  branca: "#e6e1db", cinza: "#9aa0a6", amarela: "#f2c200", laranja: "#e8791e",
  verde: "#2e8b57", azul: "#245ba6", roxa: "#6a2f9c", marrom: "#6a4327",
  preta: "#1a1512", coral: "#e2574c", vermelha: "#b0202a",
};
const LIGHT_BELTS = new Set(["branca", "cinza", "amarela"]);

function normalize(s: string) {
  return s.toLowerCase().trim();
}

/** Pega a posição do navegador; resolve null se negada/indisponível. */
function getPosition(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 30_000 },
    );
  });
}

export function AlunoView({
  belt,
  beltDegree,
  dateISO,
  dateLabel,
  day,
  week,
  hasGeofence,
}: {
  alunoName: string;
  belt: string | null;
  beltDegree: number | null;
  dateISO: string;
  dateLabel: string;
  day: AlunoSession[];
  week: WeekDay[];
  hasGeofence: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const todayDow = ((new Date().getDay() + 6) % 7) + 1; // JS→ISO 1=Seg..7=Dom
  const [weekDay, setWeekDay] = useState(todayDow);

  const changeDate = (v: string) => router.push(`/aluno?date=${v}`);

  const doCheckin = (sessionId: string) =>
    startTransition(async () => {
      const coords = hasGeofence ? await getPosition() : null;
      const r = await checkInToSession({
        sessionId,
        lat: coords?.lat,
        lng: coords?.lng,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Presença registrada!");
      router.refresh();
    });

  const doUndo = (sessionId: string) =>
    startTransition(async () => {
      const r = await undoCheckIn({ sessionId });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      router.refresh();
    });

  const beltKey = belt ? normalize(belt) : null;
  const beltColor = beltKey ? BELT_BG[beltKey] ?? "#9aa0a6" : "#9aa0a6";
  const beltText = beltKey && LIGHT_BELTS.has(beltKey) ? "#1a1512" : "#ffffff";

  const selectedWeek = week.find((w) => w.dayOfWeek === weekDay);

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
      {/* Faixa / graduação */}
      <div className="rounded-xl border bg-card p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          Sua graduação
        </div>
        {belt ? (
          <div className="mt-2 flex items-center gap-3">
            <span
              className="inline-flex h-8 items-center rounded-md px-3 text-sm font-semibold"
              style={{ background: beltColor, color: beltText }}
            >
              Faixa {belt}
            </span>
            <span className="text-sm text-muted-foreground">
              {beltDegree ? `${beltDegree}º grau` : "sem grau"}
            </span>
          </div>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">
            Faixa ainda não informada.
          </p>
        )}
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

      {/* Aulas do dia + check-in */}
      <section className="space-y-1.5">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          Aulas do dia
        </h3>
        {day.length === 0 ? (
          <p className="rounded-lg border bg-card p-4 text-center text-xs text-muted-foreground">
            Nenhuma aula neste dia.
          </p>
        ) : (
          day.map((s) => {
            const done = s.myCheckin !== null;
            const confirmed = s.myCheckin?.present ?? false;
            return (
              <div key={s.id} className="rounded-lg border bg-card p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-14 font-mono text-xs text-muted-foreground">
                    {s.startTime}
                  </span>
                  <span className="flex-1 font-medium">
                    {s.label}
                    {s.isKids ? (
                      <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] text-violet-800">
                        KIDS
                      </span>
                    ) : null}
                    {s.professorName ? (
                      <span className="ml-1 text-[11px] text-muted-foreground">
                        {s.professorName}
                      </span>
                    ) : null}
                  </span>
                  {confirmed ? (
                    <span className="text-xs font-medium text-emerald-600">
                      ✓ presença confirmada
                    </span>
                  ) : done ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={pending}
                      onClick={() => doUndo(s.id)}
                    >
                      <Check className="mr-1 h-4 w-4" /> Check-in feito
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => doCheckin(s.id)}
                    >
                      <MapPin className="mr-1 h-4 w-4" /> Fazer check-in
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        )}
        {hasGeofence ? (
          <p className="px-1 pt-1 text-[11px] text-muted-foreground">
            O check-in confirma sua localização — permita o acesso ao GPS.
          </p>
        ) : null}
      </section>

      {/* Cronograma da semana */}
      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase text-muted-foreground">
          Cronograma da semana
        </h3>
        <div className="flex flex-wrap gap-1">
          {week.map((w) => (
            <button
              key={w.dayOfWeek}
              type="button"
              onClick={() => setWeekDay(w.dayOfWeek)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                w.dayOfWeek === weekDay
                  ? "bg-primary text-primary-foreground"
                  : "bg-card text-muted-foreground hover:bg-accent"
              }`}
            >
              {DIAS[w.dayOfWeek].slice(0, 3)}
            </button>
          ))}
        </div>
        <div className="rounded-lg border bg-card p-1">
          {selectedWeek && selectedWeek.classes.length > 0 ? (
            selectedWeek.classes.map((c, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm odd:bg-muted/30"
              >
                <span className="w-14 font-mono text-xs text-muted-foreground">
                  {c.startTime}
                </span>
                <span className="flex-1 font-medium">{c.label}</span>
                {c.professorName ? (
                  <span className="text-[11px] text-muted-foreground">
                    {c.professorName}
                  </span>
                ) : null}
              </div>
            ))
          ) : (
            <p className="p-3 text-center text-xs text-muted-foreground">
              Sem aulas em {DIAS[weekDay]}.
            </p>
          )}
        </div>
      </section>

      {pending ? (
        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> processando…
        </p>
      ) : null}
    </main>
  );
}

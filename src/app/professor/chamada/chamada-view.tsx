"use client";

import { Check, Loader2, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ChamadaSession } from "@/server/class-sessions";

import {
  addPresence,
  confirmPresence,
  removePresence,
  unconfirmPresence,
} from "../chamada-actions";

type Aluno = { id: string; nome: string; matricula: string | null };

export function ChamadaView({
  dateISO,
  dateLabel,
  sessions,
  alunos,
}: {
  dateISO: string;
  dateLabel: string;
  sessions: ChamadaSession[];
  alunos: Aluno[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [addBySession, setAddBySession] = useState<Record<string, string>>({});

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

  const changeDate = (v: string) => router.push(`/professor/chamada?date=${v}`);

  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-4">
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

      {sessions.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhuma aula neste dia.
        </p>
      ) : (
        sessions.map((s) => {
          const presentCount = s.checkins.filter((c) => c.present).length;
          const naSession = new Set(s.checkins.map((c) => c.alunoId));
          const candidatos = alunos.filter((a) => !naSession.has(a.id));
          return (
            <section key={s.id} className="rounded-xl border bg-card p-4">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {s.startTime}
                  </span>
                  <span className="font-semibold">{s.label}</span>
                  {s.isKids ? (
                    <span className="rounded bg-violet-100 px-1 text-[10px] text-violet-800">
                      KIDS
                    </span>
                  ) : null}
                </div>
                <span className="text-xs text-muted-foreground">
                  {presentCount}/{s.checkins.length} presentes
                </span>
              </div>
              {s.professorName ? (
                <div className="mb-2 text-[11px] text-muted-foreground">
                  {s.professorName}
                </div>
              ) : null}

              {s.checkins.length === 0 ? (
                <p className="py-2 text-center text-xs text-muted-foreground">
                  Ninguém fez check-in ainda.
                </p>
              ) : (
                <ul className="space-y-1">
                  {s.checkins.map((c) => (
                    <li
                      key={c.checkInId}
                      className="flex items-center gap-2 rounded-lg border p-2 text-sm"
                    >
                      <span className="flex-1">
                        {c.alunoNome}
                        {c.matricula ? (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            #{c.matricula}
                          </span>
                        ) : null}
                        {c.source === "PROFESSOR" ? (
                          <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">
                            add. prof
                          </span>
                        ) : null}
                      </span>
                      {c.present ? (
                        <Button
                          size="sm"
                          variant="secondary"
                          disabled={pending}
                          onClick={() => run(() => unconfirmPresence({ checkInId: c.checkInId }))}
                        >
                          <Check className="mr-1 h-4 w-4" /> Presente
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          disabled={pending}
                          onClick={() => run(() => confirmPresence({ checkInId: c.checkInId }), "Presença confirmada")}
                        >
                          Confirmar
                        </Button>
                      )}
                      {c.source === "PROFESSOR" ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => run(() => removePresence({ checkInId: c.checkInId }))}
                          className="text-muted-foreground hover:text-destructive"
                          title="Remover"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}

              {/* Adicionar quem veio sem bater check-in */}
              <div className="mt-2 flex items-center gap-2">
                <select
                  value={addBySession[s.id] ?? ""}
                  onChange={(e) =>
                    setAddBySession((p) => ({ ...p, [s.id]: e.target.value }))
                  }
                  disabled={pending || candidatos.length === 0}
                  className="h-9 flex-1 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">
                    {candidatos.length === 0
                      ? "todos os alunos já estão na lista"
                      : "Adicionar aluno presente…"}
                  </option>
                  {candidatos.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.nome}
                      {a.matricula ? ` (#${a.matricula})` : ""}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !addBySession[s.id]}
                  onClick={() => {
                    const alunoId = addBySession[s.id];
                    if (!alunoId) return;
                    setAddBySession((p) => ({ ...p, [s.id]: "" }));
                    run(() => addPresence({ sessionId: s.id, alunoId }), "Presença adicionada");
                  }}
                >
                  <Plus className="mr-1 h-4 w-4" /> Add
                </Button>
              </div>
            </section>
          );
        })
      )}

      {pending ? (
        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> processando…
        </p>
      ) : null}
    </main>
  );
}

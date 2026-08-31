"use client";

import { format } from "date-fns";
import { Check, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { deleteSession, saveSession } from "./actions";

export type SessionRow = {
  id: string;
  scheduledDate: Date | string | null;
  completedAt: Date | string | null;
  notes: string | null;
  // v1.1-BZ: professor da aula.
  professorId: string | null;
  professorName: string | null;
};

export type SessionsTarget = {
  id: string;
  leadName: string;
  totalClasses: number;
  sessions: SessionRow[];
};

type Professor = { id: string; name: string };

const NO_PROF = "__none__";

/** Estilo de <select> nativo compacto (evita peso do ui/Select por linha). */
const selectCls =
  "h-8 rounded-md border bg-background px-2 text-xs disabled:opacity-50";

export function SessionsModal({
  target,
  professors,
  onClose,
}: {
  target: SessionsTarget | null;
  professors: Professor[];
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {target ? (
          <Body
            key={target.id}
            target={target}
            professors={professors}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  target,
  professors,
  onClose,
}: {
  target: SessionsTarget;
  professors: Professor[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newDate, setNewDate] = useState("");
  const [newProf, setNewProf] = useState<string>(NO_PROF);

  const completed = target.sessions.filter((s) => s.completedAt).length;
  const refresh = () => startTransition(() => router.refresh());

  // Payload base que PRESERVA todos os campos da sessão (senão salvar 1 campo
  // zeraria os outros — ex.: concluir apagaria o professor).
  const basePayload = (s: SessionRow) => ({
    packageId: target.id,
    sessionId: s.id,
    scheduledDate: s.scheduledDate
      ? new Date(s.scheduledDate).toISOString().slice(0, 10)
      : null,
    completed: Boolean(s.completedAt),
    completedDate: s.completedAt
      ? new Date(s.completedAt).toISOString().slice(0, 10)
      : null,
    professorId: s.professorId,
    notes: s.notes,
  });

  const runSave = (
    payload: Parameters<typeof saveSession>[0],
    successMsg?: string,
  ) => {
    startTransition(async () => {
      const result = await saveSession(payload);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (successMsg) toast.success(successMsg);
      router.refresh();
    });
  };

  const addSession = () => {
    runSave(
      {
        packageId: target.id,
        scheduledDate: newDate || null,
        completed: false,
        professorId: newProf === NO_PROF ? null : newProf,
      },
      "Aula adicionada",
    );
    setNewDate("");
    setNewProf(NO_PROF);
  };

  const toggleCompleted = (s: SessionRow) =>
    runSave({ ...basePayload(s), completed: !s.completedAt });

  const setProfessor = (s: SessionRow, profId: string) =>
    runSave({ ...basePayload(s), professorId: profId === NO_PROF ? null : profId });

  const removeSession = (s: SessionRow) => {
    startTransition(async () => {
      const result = await deleteSession({ packageId: target.id, sessionId: s.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Aulas — {target.leadName}</DialogTitle>
        <DialogDescription>
          {completed}/{target.totalClasses} concluídas
          {completed >= target.totalClasses ? " · contrato concluído ✓" : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        {/* Agendar nova aula: data + professor */}
        <div className="space-y-1 rounded-lg border p-2.5">
          <Label>Agendar nova aula</Label>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 space-y-1">
              <span className="text-[11px] text-muted-foreground">Data</span>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                disabled={pending}
              />
            </div>
            <div className="flex-1 space-y-1">
              <span className="text-[11px] text-muted-foreground">Professor</span>
              <select
                value={newProf}
                onChange={(e) => setNewProf(e.target.value)}
                disabled={pending}
                className={`${selectCls} h-9 w-full`}
              >
                <option value={NO_PROF}>— a definir —</option>
                {professors.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={addSession} disabled={pending}>
              <Plus className="mr-1 h-4 w-4" />
              Adicionar
            </Button>
          </div>
        </div>

        <div className="max-h-72 space-y-1.5 overflow-y-auto">
          {target.sessions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma aula registrada ainda. Adicione as datas agendadas acima.
            </p>
          ) : (
            target.sessions.map((s, i) => {
              const done = Boolean(s.completedAt);
              return (
                <div
                  key={s.id}
                  className="flex flex-wrap items-center gap-2 rounded border px-2 py-1.5 text-sm"
                >
                  <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
                  <span className="min-w-[90px]">
                    {s.scheduledDate
                      ? format(new Date(s.scheduledDate), "dd/MM/yyyy")
                      : "(sem data)"}
                    {done ? (
                      <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">
                        ✓ {format(new Date(s.completedAt!), "dd/MM")}
                      </span>
                    ) : null}
                  </span>
                  {/* Professor — editável a qualquer momento (substituição). */}
                  <select
                    value={s.professorId ?? NO_PROF}
                    onChange={(e) => setProfessor(s, e.target.value)}
                    disabled={pending}
                    className={`${selectCls} flex-1`}
                    title="Professor que deu a aula"
                  >
                    <option value={NO_PROF}>— sem professor —</option>
                    {professors.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                    {/* Professor inativo já vinculado: mantém visível. */}
                    {s.professorId &&
                    !professors.some((p) => p.id === s.professorId) ? (
                      <option value={s.professorId}>
                        {s.professorName ?? "(professor inativo)"}
                      </option>
                    ) : null}
                  </select>
                  <Button
                    variant={done ? "secondary" : "outline"}
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => toggleCompleted(s)}
                    disabled={pending}
                    title={done ? "Marcar como não concluída" : "Marcar como concluída"}
                  >
                    <Check className="h-3.5 w-3.5" />
                    {done ? "Concluída" : "Concluir"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-600"
                    onClick={() => removeSession(s)}
                    disabled={pending}
                    aria-label="Remover aula"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          variant="outline"
          onClick={() => {
            refresh();
            onClose();
          }}
          disabled={pending}
        >
          Fechar
        </Button>
      </div>
    </>
  );
}

"use client";

import { format } from "date-fns";
import { Check, Plus, RefreshCw, Trash2 } from "lucide-react";
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

import {
  deleteRenewal,
  deleteSession,
  registerRenewal,
  saveSession,
  setRecurrence,
} from "./actions";

export type SessionRow = {
  id: string;
  scheduledDate: Date | string | null;
  completedAt: Date | string | null;
  notes: string | null;
  // v1.1-BZ: professor da aula.
  professorId: string | null;
  professorName: string | null;
};

export type RenewalRow = {
  id: string;
  paidAt: Date | string;
  classesAdded: number;
  value: number | string | null;
  note: string | null;
};

export type SessionsTarget = {
  id: string;
  leadName: string;
  totalClasses: number;
  sessions: SessionRow[];
  // v1.2-AF: recorrência.
  recurring: boolean;
  recurringDay: number | null;
  recurringClasses: number | null;
  renewals: RenewalRow[];
};

type Professor = { id: string; name: string };

const NO_PROF = "__none__";

/** Estilo de <select> nativo compacto (evita peso do ui/Select por linha). */
const selectCls =
  "h-8 rounded-md border bg-background px-2 text-xs disabled:opacity-50";

export function SessionsModal({
  target,
  professors,
  hideFinancials = false,
  onClose,
}: {
  target: SessionsTarget | null;
  professors: Professor[];
  hideFinancials?: boolean;
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
            hideFinancials={hideFinancials}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

const todayISO = () => new Date().toISOString().slice(0, 10);

function Body({
  target,
  professors,
  hideFinancials,
  onClose,
}: {
  target: SessionsTarget;
  professors: Professor[];
  hideFinancials: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newDate, setNewDate] = useState("");
  const [newProf, setNewProf] = useState<string>(NO_PROF);

  // Recorrência (v1.2-AF).
  const [recurring, setRecurringState] = useState(target.recurring);
  const [recDay, setRecDay] = useState(target.recurringDay ? String(target.recurringDay) : "");
  const [recClasses, setRecClasses] = useState(
    target.recurringClasses ? String(target.recurringClasses) : "",
  );
  const [renewDate, setRenewDate] = useState(todayISO());
  const [renewClasses, setRenewClasses] = useState(
    target.recurringClasses ? String(target.recurringClasses) : "",
  );
  const [renewValue, setRenewValue] = useState("");

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

  const saveRecurrence = (on: boolean) =>
    startTransition(async () => {
      const r = await setRecurrence({
        packageId: target.id,
        recurring: on,
        recurringDay: recDay ? Number(recDay) : null,
        recurringClasses: recClasses ? Number(recClasses) : null,
      });
      if (!r.ok) return void toast.error(r.error);
      setRecurringState(on);
      toast.success(on ? "Recorrência salva" : "Recorrência desativada");
      router.refresh();
    });

  const doRegisterRenewal = () => {
    const cls = Number(renewClasses);
    if (!renewDate) return void toast.error("Informe a data do pagamento");
    if (!cls || cls < 1) return void toast.error("Informe quantas aulas entraram");
    startTransition(async () => {
      const r = await registerRenewal({
        packageId: target.id,
        paidAt: renewDate,
        classesAdded: cls,
        value: renewValue ? Number(renewValue) : null,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`+${cls} aulas adicionadas ao saldo`);
      setRenewValue("");
      router.refresh();
    });
  };

  const removeRenewal = (id: string) =>
    startTransition(async () => {
      const r = await deleteRenewal({ packageId: target.id, renewalId: id });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Cobrança removida");
      router.refresh();
    });

  const nextChargeLabel = (day: number): string => {
    const now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth();
    if (now.getDate() >= day) {
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return new Date(y, m, Math.min(day, 28)).toLocaleDateString("pt-BR");
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

      {/* Recorrência (v1.2-AF): cobrança do cartão a cada ciclo + histórico. */}
      <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
        <div className="flex items-center justify-between">
          <Label className="flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Recorrência (cartão)
          </Label>
          <label className="flex items-center gap-1.5 text-xs">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => saveRecurrence(e.target.checked)}
              disabled={pending}
            />
            Pacote recorrente
          </label>
        </div>

        {recurring ? (
          <>
            <div className="flex flex-wrap items-end gap-2">
              <div className="w-24 space-y-1">
                <span className="text-[11px] text-muted-foreground">Dia da cobrança</span>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={recDay}
                  onChange={(e) => setRecDay(e.target.value)}
                  onBlur={() => saveRecurrence(true)}
                  disabled={pending}
                  placeholder="23"
                />
              </div>
              <div className="w-28 space-y-1">
                <span className="text-[11px] text-muted-foreground">Aulas por ciclo</span>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={recClasses}
                  onChange={(e) => setRecClasses(e.target.value)}
                  onBlur={() => saveRecurrence(true)}
                  disabled={pending}
                  placeholder="8"
                />
              </div>
              {recDay ? (
                <p className="pb-2 text-[11px] text-muted-foreground">
                  Próxima cobrança prevista: <b>{nextChargeLabel(Number(recDay))}</b>
                </p>
              ) : null}
            </div>

            {/* Registrar uma cobrança/pagamento — soma as aulas ao saldo. */}
            <div className="space-y-1 rounded-md border bg-background p-2">
              <span className="text-[11px] font-medium">Registrar cobrança</span>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 space-y-1">
                  <span className="text-[11px] text-muted-foreground">Data do pagamento</span>
                  <Input type="date" value={renewDate} onChange={(e) => setRenewDate(e.target.value)} disabled={pending} />
                </div>
                <div className="w-20 space-y-1">
                  <span className="text-[11px] text-muted-foreground">Aulas</span>
                  <Input type="number" min={1} value={renewClasses} onChange={(e) => setRenewClasses(e.target.value)} disabled={pending} placeholder="8" />
                </div>
                {hideFinancials ? null : (
                  <div className="w-24 space-y-1">
                    <span className="text-[11px] text-muted-foreground">Valor (opc.)</span>
                    <Input type="number" min={0} step="0.01" value={renewValue} onChange={(e) => setRenewValue(e.target.value)} disabled={pending} placeholder="R$" />
                  </div>
                )}
                <Button size="sm" onClick={doRegisterRenewal} disabled={pending}>
                  <Plus className="mr-1 h-4 w-4" /> Registrar
                </Button>
              </div>
            </div>

            {/* Histórico de cobranças */}
            {target.renewals.length > 0 ? (
              <ul className="space-y-1">
                {target.renewals.map((rn) => (
                  <li key={rn.id} className="flex items-center gap-2 rounded border bg-background px-2 py-1 text-xs">
                    <span className="tabular-nums">{format(new Date(rn.paidAt), "dd/MM/yyyy")}</span>
                    <span className="font-medium text-emerald-700 dark:text-emerald-300">+{rn.classesAdded} aulas</span>
                    {!hideFinancials && rn.value != null ? (
                      <span className="text-muted-foreground">
                        {Number(rn.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeRenewal(rn.id)}
                      disabled={pending}
                      className="ml-auto text-muted-foreground hover:text-red-600"
                      aria-label="Remover cobrança"
                      title="Remover (desfaz as aulas somadas)"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-muted-foreground">Nenhuma cobrança registrada ainda.</p>
            )}
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Marque quando o cartão do aluno é cobrado a cada ciclo. Ao registrar
            cada cobrança, as aulas entram no saldo automaticamente.
          </p>
        )}
      </div>

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

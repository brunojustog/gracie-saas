"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { createGridSlot, deleteGridSlot, updateGridSlot } from "./actions";

type Prof = { id: string; name: string };
type Slot = {
  id: string;
  professorId: string;
  professorName: string;
  dayOfWeek: number;
  startTime: string;
  label: string;
  isKids: boolean;
  value: number;
  active: boolean;
};

const DAYS = [
  { n: 1, label: "Segunda" },
  { n: 2, label: "Terça" },
  { n: 3, label: "Quarta" },
  { n: 4, label: "Quinta" },
  { n: 5, label: "Sexta" },
  { n: 6, label: "Sábado" },
  { n: 7, label: "Domingo" },
];

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function GradeEditor({
  slots,
  professors,
}: {
  slots: Slot[];
  professors: Prof[];
}) {
  const [editing, setEditing] = useState<Slot | null>(null);
  const [creatingDay, setCreatingDay] = useState<number | null>(null);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Grade de aulas</h2>
        <p className="text-xs text-muted-foreground">
          A grade padrão de cada professor. É o que aparece pra ele confirmar no
          dia. Aulas KIDS pedem um professor auxiliar na confirmação.
        </p>
      </div>

      {professors.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Cadastre professores antes (Config → Professores).
        </p>
      ) : (
        <div className="space-y-3">
          {DAYS.map((d) => {
            const daySlots = slots.filter((s) => s.dayOfWeek === d.n);
            if (daySlots.length === 0 && d.n > 5) return null; // esconde fim de semana vazio
            return (
              <div key={d.n} className="rounded-lg border bg-card">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-sm font-semibold">{d.label}</span>
                  <Button size="sm" variant="ghost" onClick={() => setCreatingDay(d.n)}>
                    <Plus className="mr-1 h-4 w-4" /> Aula
                  </Button>
                </div>
                {daySlots.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-muted-foreground">Sem aulas.</p>
                ) : (
                  <ul className="divide-y">
                    {daySlots.map((s) => (
                      <li
                        key={s.id}
                        className={`flex items-center gap-2 px-3 py-2 text-sm ${
                          !s.active ? "opacity-50" : ""
                        }`}
                      >
                        <span className="w-14 font-mono text-xs text-muted-foreground">
                          {s.startTime}
                        </span>
                        <span className="flex-1">
                          <span className="font-medium">{s.label}</span>
                          {s.isKids ? (
                            <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] text-violet-800">
                              KIDS
                            </span>
                          ) : null}
                          <span className="ml-2 text-xs text-muted-foreground">
                            {s.professorName} · {brl(s.value)}
                          </span>
                          {!s.active ? (
                            <span className="ml-1 rounded bg-muted px-1 text-[10px]">inativa</span>
                          ) : null}
                        </span>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(s)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      <SlotDialog
        slot={editing}
        creatingDay={creatingDay}
        professors={professors}
        onClose={() => {
          setEditing(null);
          setCreatingDay(null);
        }}
      />
    </div>
  );
}

function SlotDialog({
  slot,
  creatingDay,
  professors,
  onClose,
}: {
  slot: Slot | null;
  creatingDay: number | null;
  professors: Prof[];
  onClose: () => void;
}) {
  const open = slot !== null || creatingDay !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <SlotBody
            key={slot?.id ?? `new-${creatingDay}`}
            slot={slot}
            day={slot?.dayOfWeek ?? creatingDay ?? 1}
            professors={professors}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SlotBody({
  slot,
  day,
  professors,
  onClose,
}: {
  slot: Slot | null;
  day: number;
  professors: Prof[];
  onClose: () => void;
}) {
  const [professorId, setProfessorId] = useState(slot?.professorId ?? professors[0]?.id ?? "");
  const [dayOfWeek, setDayOfWeek] = useState(day);
  const [startTime, setStartTime] = useState(slot?.startTime ?? "19:00");
  const [label, setLabel] = useState(slot?.label ?? "");
  const [isKids, setIsKids] = useState(slot?.isKids ?? false);
  const [value, setValue] = useState(String(slot?.value ?? 70));
  const [active, setActive] = useState(slot?.active ?? true);
  const [pending, startTransition] = useTransition();

  const save = () => {
    if (!professorId) return toast.error("Escolha o professor");
    if (!label.trim()) return toast.error("Informe a modalidade (ex: GB1, GBK)");
    const val = Number(value.replace(",", "."));
    if (!Number.isFinite(val) || val < 0) return toast.error("Valor inválido");
    startTransition(async () => {
      const base = { professorId, dayOfWeek, startTime, label: label.trim(), isKids, value: val };
      const r = slot
        ? await updateGridSlot({ ...base, id: slot.id, active })
        : await createGridSlot(base);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(slot ? "Aula atualizada" : "Aula adicionada");
      onClose();
    });
  };

  const remove = () => {
    if (!slot) return;
    if (!window.confirm("Remover essa aula da grade? (o histórico de aulas dadas é preservado)")) return;
    startTransition(async () => {
      const r = await deleteGridSlot({ id: slot.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Aula removida");
      onClose();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{slot ? "Editar aula da grade" : "Nova aula na grade"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Professor</Label>
            <select value={professorId} onChange={(e) => setProfessorId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={pending}>
              {professors.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Dia</Label>
            <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={pending}>
              {DAYS.map((d) => (
                <option key={d.n} value={d.n}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="g-time">Hora</Label>
            <Input id="g-time" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} disabled={pending} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="g-label">Modalidade</Label>
            <Input id="g-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="GB1, GBK, JUNIORES…" list="grade-labels" disabled={pending} />
            <datalist id="grade-labels">
              {["GB1", "GB2", "NOGI", "GBF", "GBK", "JUNIORES", "BarraFit"].map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1">
            <Label htmlFor="g-value">Valor (R$)</Label>
            <Input id="g-value" value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" disabled={pending} />
          </div>
          <div className="flex items-end justify-between rounded border p-2">
            <Label htmlFor="g-kids" className="text-sm">Aula KIDS (auxiliar)</Label>
            <Switch id="g-kids" checked={isKids} onCheckedChange={setIsKids} />
          </div>
        </div>
        {slot ? (
          <div className="flex items-center justify-between rounded border p-3">
            <div>
              <Label htmlFor="g-active">Ativa</Label>
              <p className="text-xs text-muted-foreground">Inativa some da grade do professor.</p>
            </div>
            <Switch id="g-active" checked={active} onCheckedChange={setActive} />
          </div>
        ) : null}
      </div>

      <DialogFooter className="flex items-center justify-between sm:justify-between">
        {slot ? (
          <Button variant="ghost" size="sm" className="text-red-600" onClick={remove} disabled={pending}>
            <Trash2 className="mr-1 h-4 w-4" /> Remover
          </Button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button onClick={save} disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
        </div>
      </DialogFooter>
    </>
  );
}

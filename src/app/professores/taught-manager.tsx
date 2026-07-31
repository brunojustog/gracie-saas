"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";

import { adminDeleteTaughtClass, adminEditTaughtClass } from "./actions";

type Prof = { id: string; name: string };
type Taught = {
  id: string;
  date: string;
  startTime: string;
  label: string;
  isKids: boolean;
  professorId: string;
  professorName: string;
  auxProfessorId: string | null;
  auxProfessorName: string | null;
  status: string;
};

export function TaughtManager({
  rows,
  professors,
}: {
  rows: Taught[];
  professors: Prof[];
}) {
  const [editing, setEditing] = useState<Taught | null>(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const remove = (t: Taught) => {
    if (!window.confirm(`Apagar o registro de ${t.label} ${t.startTime} (${t.professorName})?`)) return;
    startTransition(async () => {
      const r = await adminDeleteTaughtClass({ id: t.id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Registro apagado");
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-4 text-center text-xs text-muted-foreground">
        Nenhuma aula confirmada no período.
      </p>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="px-2 py-2 font-medium">Dia</th>
              <th className="px-2 py-2 font-medium">Hora</th>
              <th className="px-2 py-2 font-medium">Aula</th>
              <th className="px-2 py-2 font-medium">Professor</th>
              <th className="px-2 py-2 font-medium">Auxiliar</th>
              <th className="px-2 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                  {format(new Date(t.date), "dd/MM EEE", { locale: ptBR })}
                </td>
                <td className="px-2 py-1.5 font-mono text-xs">{t.startTime}</td>
                <td className="px-2 py-1.5">
                  {t.label}
                  {t.isKids ? (
                    <span className="ml-1 rounded bg-violet-100 px-1 text-[10px] text-violet-800">KIDS</span>
                  ) : null}
                  {t.status === "PENDING" ? (
                    <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800">pendente</span>
                  ) : null}
                </td>
                <td className="px-2 py-1.5">{t.professorName}</td>
                <td className="px-2 py-1.5 text-muted-foreground">
                  {t.auxProfessorName ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-right">
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(t)} disabled={pending}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600" onClick={() => remove(t)} disabled={pending}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <EditDialog target={editing} professors={professors} onClose={() => setEditing(null)} />
    </>
  );
}

const NO_AUX = "__none__";

function EditDialog({
  target,
  professors,
  onClose,
}: {
  target: Taught | null;
  professors: Prof[];
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target ? <EditBody key={target.id} target={target} professors={professors} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function EditBody({
  target,
  professors,
  onClose,
}: {
  target: Taught;
  professors: Prof[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [professorId, setProfessorId] = useState(target.professorId);
  const [auxProfessorId, setAuxProfessorId] = useState(target.auxProfessorId ?? NO_AUX);
  const [pending, startTransition] = useTransition();

  const save = () => {
    startTransition(async () => {
      const r = await adminEditTaughtClass({
        id: target.id,
        professorId,
        auxProfessorId: auxProfessorId === NO_AUX ? null : auxProfessorId,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Registro atualizado");
      onClose();
      router.refresh();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {target.label} · {target.startTime}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Professor (quem deu)</Label>
          <select value={professorId} onChange={(e) => setProfessorId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={pending}>
            {professors.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Auxiliar {target.isKids ? "(KIDS)" : ""}</Label>
          <select value={auxProfessorId} onChange={(e) => setAuxProfessorId(e.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm" disabled={pending}>
            <option value={NO_AUX}>— sem auxiliar —</option>
            {professors.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
        <Button onClick={save} disabled={pending}>{pending ? "Salvando…" : "Salvar"}</Button>
      </DialogFooter>
    </>
  );
}

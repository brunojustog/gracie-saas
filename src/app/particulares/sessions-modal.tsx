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
};

export type SessionsTarget = {
  id: string;
  leadName: string;
  totalClasses: number;
  sessions: SessionRow[];
};

export function SessionsModal({
  target,
  onClose,
}: {
  target: SessionsTarget | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {target ? <Body key={target.id} target={target} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({ target, onClose }: { target: SessionsTarget; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [newDate, setNewDate] = useState("");

  const completed = target.sessions.filter((s) => s.completedAt).length;

  const refresh = () => startTransition(() => router.refresh());

  const addSession = () => {
    startTransition(async () => {
      const result = await saveSession({
        packageId: target.id,
        scheduledDate: newDate || null,
        completed: false,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setNewDate("");
      toast.success("Aula adicionada");
      router.refresh();
    });
  };

  const toggleCompleted = (s: SessionRow) => {
    startTransition(async () => {
      const result = await saveSession({
        packageId: target.id,
        sessionId: s.id,
        scheduledDate: s.scheduledDate
          ? new Date(s.scheduledDate).toISOString().slice(0, 10)
          : null,
        completed: !s.completedAt,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      router.refresh();
    });
  };

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
        <div className="flex items-end gap-2">
          <div className="flex-1 space-y-1">
            <Label htmlFor="new-session">Agendar nova aula</Label>
            <Input
              id="new-session"
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              disabled={pending}
            />
          </div>
          <Button onClick={addSession} disabled={pending}>
            <Plus className="mr-1 h-4 w-4" />
            Adicionar
          </Button>
        </div>

        <div className="max-h-72 space-y-1 overflow-y-auto">
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
                  className="flex items-center gap-2 rounded border px-2 py-1.5 text-sm"
                >
                  <span className="w-5 text-xs text-muted-foreground">{i + 1}.</span>
                  <span className="flex-1">
                    {s.scheduledDate
                      ? format(new Date(s.scheduledDate), "dd/MM/yyyy")
                      : "(sem data)"}
                    {done ? (
                      <span className="ml-2 text-xs text-emerald-600 dark:text-emerald-400">
                        concluída {format(new Date(s.completedAt!), "dd/MM")}
                      </span>
                    ) : null}
                  </span>
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

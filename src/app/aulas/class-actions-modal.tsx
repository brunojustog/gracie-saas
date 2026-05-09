"use client";

import type { ExperimentalClassStatus } from "@prisma/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CheckCircle2, Loader2, UserX, Video, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { rescheduleClass, updateClassStatus } from "./actions";

type CalendarClass = {
  id: string;
  scheduledDate: Date | string;
  status: ExperimentalClassStatus;
  notes: string | null;
  modalityId: string;
  leadId: string;
  modality: { id: string; name: string; color: string | null };
  lead: {
    id: string;
    name: string;
    phone: string | null;
    assignedSellerId: string | null;
    assignedSeller: { id: string; name: string | null; email: string } | null;
  };
};

const STATUS_LABEL: Record<ExperimentalClassStatus, string> = {
  SCHEDULED: "Agendada",
  CONFIRMED: "Confirmada",
  ATTENDED: "Compareceu",
  NO_SHOW: "Não compareceu",
  RESCHEDULED: "Remarcada",
  CANCELED: "Cancelada",
};

type Props = {
  cls: CalendarClass | null;
  onOpenChange: (open: boolean) => void;
  onUpdated: (cls: CalendarClass) => void;
};

function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ClassActionsModal({ cls, onOpenChange, onUpdated }: Props) {
  const [pending, startTransition] = useTransition();
  const [rescheduleMode, setRescheduleMode] = useState(false);
  const [newDateTime, setNewDateTime] = useState("");

  if (!cls) {
    return (
      <Dialog open={false} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const scheduled = new Date(cls.scheduledDate);
  const isFinalState =
    cls.status === "ATTENDED" ||
    cls.status === "NO_SHOW" ||
    cls.status === "CANCELED";

  const setStatus = (status: "CONFIRMED" | "ATTENDED" | "NO_SHOW" | "CANCELED") => {
    startTransition(async () => {
      const result = await updateClassStatus({ classId: cls.id, status });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Status: ${STATUS_LABEL[status]}`);
      onUpdated({ ...cls, status });
    });
  };

  const handleReschedule = () => {
    if (!newDateTime) return;
    const iso = new Date(newDateTime).toISOString();
    startTransition(async () => {
      const result = await rescheduleClass({ classId: cls.id, scheduledDate: iso });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Aula remarcada");
      onUpdated({
        ...cls,
        scheduledDate: new Date(iso),
        status: "RESCHEDULED",
      });
      setRescheduleMode(false);
      setNewDateTime("");
    });
  };

  return (
    <Dialog open={cls !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: cls.modality.color ?? "#6B7280" }}
              aria-hidden
            />
            {cls.lead.name}
          </DialogTitle>
          <DialogDescription>
            {cls.modality.name} ·{" "}
            {format(scheduled, "EEE, dd MMM 'às' HH:mm", { locale: ptBR })}
            <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-xs">
              {STATUS_LABEL[cls.status]}
            </span>
          </DialogDescription>
        </DialogHeader>

        {cls.lead.phone || cls.notes ? (
          <div className="space-y-1 rounded border bg-muted/30 p-3 text-sm">
            {cls.lead.phone ? (
              <div>
                <span className="text-xs text-muted-foreground">telefone</span>{" "}
                <span className="font-medium">{cls.lead.phone}</span>
              </div>
            ) : null}
            {cls.lead.assignedSeller ? (
              <div>
                <span className="text-xs text-muted-foreground">vendedora</span>{" "}
                <span className="font-medium">
                  {cls.lead.assignedSeller.name ?? cls.lead.assignedSeller.email}
                </span>
              </div>
            ) : null}
            {cls.notes ? (
              <div>
                <span className="text-xs text-muted-foreground">obs</span>{" "}
                <span className="italic">{cls.notes}</span>
              </div>
            ) : null}
          </div>
        ) : null}

        {rescheduleMode ? (
          <div className="space-y-2">
            <Label htmlFor="newdate">Nova data e hora</Label>
            <Input
              id="newdate"
              type="datetime-local"
              value={newDateTime || toDatetimeLocalValue(scheduled)}
              onChange={(e) => setNewDateTime(e.target.value)}
              disabled={pending}
            />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setRescheduleMode(false)}
                disabled={pending}
                className="flex-1"
              >
                Voltar
              </Button>
              <Button onClick={handleReschedule} disabled={pending} className="flex-1">
                {pending ? "Remarcando…" : "Remarcar"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {(cls.status === "SCHEDULED" || cls.status === "RESCHEDULED") && (
              <Button onClick={() => setStatus("CONFIRMED")} disabled={pending} variant="outline">
                <Video className="mr-1 h-4 w-4" />
                Confirmar
              </Button>
            )}
            {!isFinalState && (
              <Button onClick={() => setStatus("ATTENDED")} disabled={pending}>
                <CheckCircle2 className="mr-1 h-4 w-4" />
                Compareceu
              </Button>
            )}
            {!isFinalState && (
              <Button onClick={() => setStatus("NO_SHOW")} disabled={pending} variant="outline">
                <UserX className="mr-1 h-4 w-4" />
                Faltou
              </Button>
            )}
            {!isFinalState && (
              <Button
                onClick={() => setRescheduleMode(true)}
                disabled={pending}
                variant="outline"
              >
                Remarcar
              </Button>
            )}
            {!isFinalState && (
              <Button
                onClick={() => setStatus("CANCELED")}
                disabled={pending}
                variant="outline"
                className="col-span-2 text-destructive hover:text-destructive"
              >
                <X className="mr-1 h-4 w-4" />
                Cancelar aula
              </Button>
            )}
          </div>
        )}

        <DialogFooter>
          {pending ? (
            <span className="flex items-center text-xs text-muted-foreground">
              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
              processando
            </span>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

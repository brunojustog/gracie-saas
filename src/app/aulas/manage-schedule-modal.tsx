"use client";

/**
 * Modal "Gerenciar grade" (v1.1-AA): lista todos os slots da grade
 * agrupados por dia da semana com botões pra editar/excluir cada um.
 *
 * Necessário porque o FullCalendar 6 não dispara eventClick em eventos
 * com `display: "background"`, então o `SlotActionsModal` (criado na
 * v1.1-S pra disparar via click no slot colorido) nunca era acessível.
 * Esta lista é descobrível independente do comportamento do FC.
 */
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
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

import { deleteScheduleSlot } from "./schedule-actions";

type Modality = { id: string; name: string; color: string | null };

type ScheduleSlot = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  modalityId: string;
  modality: Modality;
};

const DAY_LABEL = [
  "Domingo",
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slots: ScheduleSlot[];
  onEditSlot: (slotId: string) => void;
};

export function ManageScheduleModal({
  open,
  onOpenChange,
  slots,
  onEditSlot,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl">
        <Body slots={slots} onEditSlot={onEditSlot} />
      </DialogContent>
    </Dialog>
  );
}

function Body({
  slots,
  onEditSlot,
}: {
  slots: ScheduleSlot[];
  onEditSlot: (slotId: string) => void;
}) {
  // Agrupa por dia da semana, preservando ordem domingo→sábado.
  const byDay = new Map<number, ScheduleSlot[]>();
  for (let d = 0; d <= 6; d++) byDay.set(d, []);
  for (const s of slots) {
    byDay.get(s.dayOfWeek)?.push(s);
  }
  // Ordena cada dia por horário ASC.
  for (const arr of byDay.values()) {
    arr.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Gerenciar grade</DialogTitle>
        <DialogDescription>
          Editar ou excluir horários da grade fixa. Aulas já marcadas não são
          afetadas — só o fundo colorido do calendário muda.
        </DialogDescription>
      </DialogHeader>

      {slots.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nenhum horário na grade ainda. Use o botão &quot;+ Novo horário&quot;.
        </p>
      ) : (
        <div className="space-y-4">
          {Array.from(byDay.entries()).map(([day, daySlots]) => {
            if (daySlots.length === 0) return null;
            return (
              <div key={day}>
                <h4 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {DAY_LABEL[day]}
                </h4>
                <ul className="space-y-1.5">
                  {daySlots.map((s) => (
                    <SlotRow
                      key={s.id}
                      slot={s}
                      onEdit={() => onEditSlot(s.id)}
                    />
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function SlotRow({ slot, onEdit }: { slot: ScheduleSlot; onEdit: () => void }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteScheduleSlot({ id: slot.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Horário removido");
      setConfirming(false);
      router.refresh();
    });
  };

  return (
    <li className="flex items-center gap-3 rounded-md border bg-card p-2.5">
      <span
        className="h-3 w-3 shrink-0 rounded-full"
        style={{ background: slot.modality.color ?? "#6B7280" }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{slot.modality.name}</div>
        <div className="text-[11px] text-muted-foreground">
          {slot.startTime} · {slot.durationMinutes}min
        </div>
      </div>
      {confirming ? (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(false)}
            disabled={pending}
            className="h-8 text-xs"
          >
            Cancelar
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={pending}
            className="h-8 text-xs"
          >
            {pending ? "Removendo…" : "Confirmar"}
          </Button>
        </>
      ) : (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            disabled={pending}
            className="h-8 px-2"
            title="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(true)}
            disabled={pending}
            className="h-8 px-2 text-red-600 hover:text-red-700"
            title="Excluir"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </>
      )}
    </li>
  );
}

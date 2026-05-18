"use client";

import { CalendarPlus, Pencil, Trash2 } from "lucide-react";
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

type SlotInfo = {
  id: string;
  modalityName: string;
  modalityColor: string | null;
  dayLabel: string;
  startTime: string;
  durationMinutes: number;
  /** Data específica clicada — usada se o usuário escolher "Agendar aula aqui". */
  clickedDate: Date;
};

type Props = {
  slot: SlotInfo | null;
  onClose: () => void;
  onScheduleClass: (date: Date) => void;
  onEditRequest: () => void;
  onDeleted?: () => void;
};

export function SlotActionsModal({
  slot,
  onClose,
  onScheduleClass,
  onEditRequest,
  onDeleted,
}: Props) {
  return (
    <Dialog open={slot !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {slot ? (
          <Body
            key={slot.id}
            slot={slot}
            onClose={onClose}
            onScheduleClass={onScheduleClass}
            onEditRequest={onEditRequest}
            onDeleted={onDeleted}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  slot,
  onClose,
  onScheduleClass,
  onEditRequest,
  onDeleted,
}: {
  slot: SlotInfo;
  onClose: () => void;
  onScheduleClass: (date: Date) => void;
  onEditRequest: () => void;
  onDeleted?: () => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteScheduleSlot({ id: slot.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Horário removido da grade");
      onDeleted?.();
      onClose();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: slot.modalityColor ?? "#6B7280" }}
            aria-hidden
          />
          {slot.modalityName}
        </DialogTitle>
        <DialogDescription>
          {slot.dayLabel} às {slot.startTime} ({slot.durationMinutes}min) — grade fixa.
        </DialogDescription>
      </DialogHeader>

      {confirmDelete ? (
        <div className="space-y-3">
          <p className="text-sm">
            Remover este horário da grade? Aulas já marcadas neste slot não são afetadas
            (continuam visíveis), mas o fundo colorido sai do calendário.
          </p>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDelete(false)}
              disabled={pending}
            >
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={pending}
            >
              {pending ? "Removendo…" : "Confirmar remoção"}
            </Button>
          </DialogFooter>
        </div>
      ) : (
        <div className="space-y-2">
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={() => onScheduleClass(slot.clickedDate)}
          >
            <CalendarPlus className="mr-2 h-4 w-4" />
            Agendar aula neste horário
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start"
            onClick={onEditRequest}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Editar este horário
          </Button>
          <Button
            variant="outline"
            className="w-full justify-start text-red-600 hover:text-red-700"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Remover da grade
          </Button>
        </div>
      )}
    </>
  );
}

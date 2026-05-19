"use client";

/**
 * Dialog "motivo da perda" (v1.1-Z) — disparado quando vendedora arrasta
 * lead pra um stage isLost no kanban. Motivo obrigatório (min 3 chars)
 * fica gravado no diário do lead + StageHistory.notes.
 */
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { moveLeadToLost } from "./actions";

type Props = {
  target: {
    leadId: string;
    leadName: string;
    toStageId: string;
    toStageName: string;
  } | null;
  onClose: () => void;
  onConfirmed: () => void;
};

export function LossReasonDialog({ target, onClose, onConfirmed }: Props) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target ? (
          <Body
            key={target.leadId + target.toStageId}
            target={target}
            onClose={onClose}
            onConfirmed={onConfirmed}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  target,
  onClose,
  onConfirmed,
}: {
  target: NonNullable<Props["target"]>;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const handleConfirm = () => {
    if (reason.trim().length < 3) {
      toast.error("Informe o motivo (mínimo 3 caracteres)");
      return;
    }
    startTransition(async () => {
      const result = await moveLeadToLost({
        leadId: target.leadId,
        toStageId: target.toStageId,
        reason: reason.trim(),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${target.leadName}: movido pra ${target.toStageName}`);
      onConfirmed();
      onClose();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Motivo da perda</DialogTitle>
        <DialogDescription>
          <span className="font-medium">{target.leadName}</span> → {target.toStageName}.
          O motivo fica gravado no diário do lead pra audit.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="loss-reason">
          Motivo <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="loss-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="ex: não tem interesse; mudou de cidade; preço fora do orçamento; sem retorno após 3 tentativas…"
          rows={4}
          disabled={pending}
          autoFocus
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button
          variant="destructive"
          onClick={handleConfirm}
          disabled={pending || reason.trim().length < 3}
        >
          {pending ? "Movendo…" : "Confirmar perda"}
        </Button>
      </DialogFooter>
    </>
  );
}

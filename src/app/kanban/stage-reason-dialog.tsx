"use client";

/**
 * Dialog "por que moveu?" (v1.1-BV) — disparado quando o lead SAI do estágio
 * de comparecimento no kanban. Justificativa obrigatória (min 3 chars) que
 * alimenta o relatório de conversão (reunião 21/07: a diretoria quer saber o
 * motivo de cada lead não fechar, sem abrir link por link).
 *
 * Perda tem o seu próprio dialog (LossReasonDialog) e Ganho abre a matrícula,
 * então esses dois NÃO passam por aqui — o registro deles já é explícito.
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

import { moveLeadToStage } from "./actions";

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

export function StageReasonDialog({ target, onClose, onConfirmed }: Props) {
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
      toast.error("Explique o motivo (mínimo 3 caracteres)");
      return;
    }
    startTransition(async () => {
      const result = await moveLeadToStage({
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
        <DialogTitle>Por que moveu pra {target.toStageName}?</DialogTitle>
        <DialogDescription>
          <span className="font-medium">{target.leadName}</span> compareceu à
          experimental. Registre o que aconteceu — isso vira o relatório de
          conversão que a diretoria acompanha.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1.5">
        <Label htmlFor="stage-reason">
          Motivo <span className="text-red-500">*</span>
        </Label>
        <Textarea
          id="stage-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="ex: gostou da aula, vai pensar no valor; quer trazer o filho junto; pediu 2ª aula pra decidir; preço acima do orçamento…"
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
          onClick={handleConfirm}
          disabled={pending || reason.trim().length < 3}
        >
          {pending ? "Movendo…" : "Salvar e mover"}
        </Button>
      </DialogFooter>
    </>
  );
}

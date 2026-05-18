"use client";

import { Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import {
  createModalityInline,
  createScheduleSlot,
  updateScheduleSlot,
} from "./schedule-actions";

type Modality = { id: string; name: string; color: string | null };

const DAY_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const NEW_MODALITY_VALUE = "__new__";

export type SlotInitial = {
  id?: string;
  modalityId: string;
  dayOfWeek: number;
  startTime: string; // HH:MM
  durationMinutes: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: SlotInitial | null;
  modalities: Modality[];
  onSaved?: () => void;
};

export function ScheduleSlotModal(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {props.open ? (
          <ModalBody
            key={props.initial?.id ?? "new"}
            {...props}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ModalBody({
  initial,
  modalities,
  onOpenChange,
  onSaved,
}: Props) {
  const isEdit = Boolean(initial?.id);
  const [modalityId, setModalityId] = useState(initial?.modalityId ?? "");
  const [dayOfWeek, setDayOfWeek] = useState<number>(initial?.dayOfWeek ?? 1);
  const [startTime, setStartTime] = useState(initial?.startTime ?? "19:00");
  const [durationMinutes, setDurationMinutes] = useState<number>(
    initial?.durationMinutes ?? 60,
  );
  const [showNewModality, setShowNewModality] = useState(false);
  const [pending, startTransition] = useTransition();

  const handleModalitySelect = (value: string) => {
    if (value === NEW_MODALITY_VALUE) {
      setShowNewModality(true);
      return;
    }
    setModalityId(value);
  };

  const handleSubmit = () => {
    if (!modalityId) {
      toast.error("Escolha uma modalidade");
      return;
    }
    startTransition(async () => {
      const payload = {
        modalityId,
        dayOfWeek,
        startTime,
        durationMinutes,
      };
      const result = isEdit
        ? await updateScheduleSlot({ id: initial!.id, ...payload })
        : await createScheduleSlot(payload);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(isEdit ? "Horário atualizado" : "Horário criado");
      onSaved?.();
      onOpenChange(false);
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{isEdit ? "Editar horário" : "Novo horário na grade"}</DialogTitle>
        <DialogDescription>
          {isEdit
            ? "Ajuste a modalidade, dia ou horário desta aula recorrente."
            : "Adiciona um slot na grade semanal. Ele aparece como fundo colorido no calendário."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="slot-modality">Modalidade</Label>
          <Select
            value={modalityId || undefined}
            onValueChange={handleModalitySelect}
            disabled={pending}
          >
            <SelectTrigger id="slot-modality">
              <SelectValue placeholder="Escolha…" />
            </SelectTrigger>
            <SelectContent>
              {modalities.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  <span className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: m.color ?? "#6B7280" }}
                      aria-hidden
                    />
                    {m.name}
                  </span>
                </SelectItem>
              ))}
              <SelectItem value={NEW_MODALITY_VALUE} className="text-primary">
                <span className="flex items-center gap-1">
                  <Plus className="h-3 w-3" />
                  Nova modalidade…
                </span>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="space-y-1">
            <Label htmlFor="slot-day">Dia</Label>
            <Select
              value={String(dayOfWeek)}
              onValueChange={(v) => setDayOfWeek(Number(v))}
              disabled={pending}
            >
              <SelectTrigger id="slot-day">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DAY_LABEL.map((label, idx) => (
                  <SelectItem key={idx} value={String(idx)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="slot-start">Horário</Label>
            <Input
              id="slot-start"
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="slot-duration">Duração (min)</Label>
            <Input
              id="slot-duration"
              type="number"
              min={15}
              max={480}
              step={15}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
              disabled={pending}
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={pending}>
          {pending ? "Salvando…" : isEdit ? "Salvar" : "Criar"}
        </Button>
      </DialogFooter>

      <NewModalityDialog
        open={showNewModality}
        onClose={() => setShowNewModality(false)}
        onCreated={(id) => {
          setModalityId(id);
          setShowNewModality(false);
        }}
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Sub-dialog: criar modalidade nova sem sair do fluxo de criar slot
// ──────────────────────────────────────────────────────────────────────────

function NewModalityDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (modalityId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        {open ? <NewModalityBody onClose={onClose} onCreated={onCreated} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function NewModalityBody({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (modalityId: string) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [color, setColor] = useState("#6B7280");
  const [ageRange, setAgeRange] = useState("");
  const [pending, startTransition] = useTransition();

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Informe o nome");
      return;
    }
    startTransition(async () => {
      const result = await createModalityInline({
        name: name.trim(),
        color,
        ageRange: ageRange.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Modalidade criada");
      // refresh repopula a lista de modalidades no parent (CalendarBoard).
      // O state do ScheduleSlotModal sobrevive porque o slot modal não
      // tem `key` baseada em modalities — só o sub-dialog (este) é remontado.
      router.refresh();
      onCreated(result.modalityId);
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Nova modalidade</DialogTitle>
        <DialogDescription>
          Cria uma modalidade nova que pode ser usada na grade e em matrículas.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="mod-name">Nome</Label>
          <Input
            id="mod-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: GB Iniciante"
            disabled={pending}
            autoFocus
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="mod-color">Cor</Label>
            <Input
              id="mod-color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 p-1"
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="mod-age">Faixa etária (opcional)</Label>
            <Input
              id="mod-age"
              value={ageRange}
              onChange={(e) => setAgeRange(e.target.value)}
              placeholder="ex: 5-12 anos"
              disabled={pending}
            />
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={pending}>
          {pending ? "Criando…" : "Criar modalidade"}
        </Button>
      </DialogFooter>
    </>
  );
}

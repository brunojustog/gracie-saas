"use client";

/**
 * Modal "agendar aula experimental" disparado pelo drag do kanban (v1.1-X).
 * Mais simples que o ScheduleModal de /aulas — sem picker de lead (já vem),
 * sem mirror de slots, só os campos essenciais: modalidade, data, hora.
 *
 * Reusa a action `scheduleClass` do /aulas/actions.
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { scheduleClass } from "../aulas/actions";

type Modality = { id: string; name: string };
type ClassKind = "INDIVIDUAL" | "GROUP";

type Props = {
  lead: { id: string; name: string; modalityId: string | null } | null;
  modalities: Modality[];
  onClose: () => void;
  onScheduled?: () => void;
};

/** Próxima hora cheia (HH:00) — bom default pra agendamento rápido. */
function nextHourIso(): { date: string; time: string } {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function QuickScheduleModal({
  lead,
  modalities,
  onClose,
  onScheduled,
}: Props) {
  return (
    <Dialog open={lead !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {lead ? (
          <Body
            key={lead.id}
            lead={lead}
            modalities={modalities}
            onClose={onClose}
            onScheduled={onScheduled}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  lead,
  modalities,
  onClose,
  onScheduled,
}: {
  lead: { id: string; name: string; modalityId: string | null };
  modalities: Modality[];
  onClose: () => void;
  onScheduled?: () => void;
}) {
  const initial = nextHourIso();
  const [modalityId, setModalityId] = useState(lead.modalityId ?? "");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time);
  const [notes, setNotes] = useState("");
  // v1.1-BV: tipo da aula. O agendamento pelo kanban só dispara pra lead sem
  // aula (é a 1ª), então o default é individual — mas o aluno pode preferir
  // começar pela turma, então deixamos escolher.
  const [kind, setKind] = useState<ClassKind>("INDIVIDUAL");
  const [pending, startTransition] = useTransition();

  const handleSubmit = () => {
    if (!modalityId) {
      toast.error("Escolha uma modalidade");
      return;
    }
    if (!date || !time) {
      toast.error("Informe data e hora");
      return;
    }
    // Constrói ISO local — assume timezone do navegador igual à academia
    // (BGAF: America/Sao_Paulo). Mesmo trade-off do ScheduleModal de /aulas.
    const localISO = new Date(`${date}T${time}:00`).toISOString();

    startTransition(async () => {
      const result = await scheduleClass({
        leadId: lead.id,
        modalityId,
        scheduledDate: localISO,
        notes: notes.trim() || undefined,
        kind,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Aula agendada");
      onScheduled?.();
      onClose();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Agendar aula experimental</DialogTitle>
        <DialogDescription>
          Pra <span className="font-medium">{lead.name}</span>. Lembretes
          automáticos são disparados via WhatsApp se o tenant tiver Wuzapi
          configurado.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="quick-modality">Modalidade</Label>
          <Select
            value={modalityId || undefined}
            onValueChange={setModalityId}
            disabled={pending}
          >
            <SelectTrigger id="quick-modality">
              <SelectValue placeholder="Escolha…" />
            </SelectTrigger>
            <SelectContent>
              {modalities.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="quick-date">Data</Label>
            <Input
              id="quick-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="quick-time">Hora</Label>
            <Input
              id="quick-time"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label>Tipo da aula</Label>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { v: "INDIVIDUAL" as const, t: "Individual", d: "só aluno + professor" },
                { v: "GROUP" as const, t: "Em turma", d: "com os alunos da turma" },
              ]
            ).map((o) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setKind(o.v)}
                disabled={pending}
                className={cn(
                  "rounded-lg border p-2 text-left text-xs transition",
                  kind === o.v
                    ? "border-primary bg-primary/10 ring-1 ring-primary/40"
                    : "hover:bg-accent",
                )}
              >
                <span className="block font-medium">{o.t}</span>
                <span className="block text-[11px] text-muted-foreground">{o.d}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="quick-notes">Observações (opcional)</Label>
          <Textarea
            id="quick-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="ex: trazer kimono emprestado, primeira aula é com Prof. André…"
            disabled={pending}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={pending || !modalityId || !date || !time}
        >
          {pending ? "Agendando…" : "Agendar"}
        </Button>
      </DialogFooter>
    </>
  );
}

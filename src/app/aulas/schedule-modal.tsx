"use client";

import type { ExperimentalClassStatus } from "@prisma/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { scheduleClass } from "./actions";

type Modality = { id: string; name: string; color: string | null };
type Lead = { id: string; name: string; phone: string | null; modalityId: string | null };
type ScheduleSlot = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  modalityId: string;
};

type CreatedClass = {
  id: string;
  scheduledDate: Date;
  status: ExperimentalClassStatus;
  notes: string | null;
  modalityId: string;
  leadId: string;
  modality: Modality;
  lead: {
    id: string;
    name: string;
    phone: string | null;
    assignedSellerId: string | null;
    assignedSeller: { id: string; name: string | null; email: string } | null;
  };
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultDate: Date | null;
  modalities: Modality[];
  leads: Lead[];
  scheduleSlots: ScheduleSlot[];
  onCreated: (cls: CreatedClass) => void;
};

/** Formata Date pra <input type="datetime-local"> (precisa "YYYY-MM-DDTHH:MM" local). */
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function ScheduleModal(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {props.defaultDate ? (
          <ModalBody
            key={props.defaultDate.toISOString()}
            {...props}
            defaultDate={props.defaultDate}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Conteúdo do modal vive num sub-componente com `key={defaultDate}` no parent
 * — a cada nova abertura o componente remonta, então o state inicial é
 * computado direto via `useState(initial)` e a regra `set-state-in-effect`
 * fica satisfeita sem effects de reset.
 */
function ModalBody({
  onOpenChange,
  defaultDate,
  modalities,
  leads,
  scheduleSlots,
  onCreated,
}: Props & { defaultDate: Date }) {
  const suggestedModalityIds = useMemo(() => {
    const day = defaultDate.getDay();
    const hh = String(defaultDate.getHours()).padStart(2, "0");
    const mm = String(defaultDate.getMinutes()).padStart(2, "0");
    const time = `${hh}:${mm}`;
    return scheduleSlots
      .filter((s) => s.dayOfWeek === day && s.startTime === time)
      .map((s) => s.modalityId);
  }, [defaultDate, scheduleSlots]);

  const [leadId, setLeadId] = useState("");
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [modalityId, setModalityId] = useState(
    suggestedModalityIds.length === 1 ? suggestedModalityIds[0]! : "",
  );
  const [datetime, setDatetime] = useState(toDatetimeLocalValue(defaultDate));
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const sortedModalities = useMemo(() => {
    if (suggestedModalityIds.length === 0) return modalities;
    const suggested = new Set(suggestedModalityIds);
    return [...modalities].sort((a, b) => {
      const aS = suggested.has(a.id) ? 0 : 1;
      const bS = suggested.has(b.id) ? 0 : 1;
      return aS - bS || a.name.localeCompare(b.name);
    });
  }, [modalities, suggestedModalityIds]);

  const sortedLeads = useMemo(
    () => [...leads].sort((a, b) => a.name.localeCompare(b.name)),
    [leads],
  );
  const selectedLead = useMemo(
    () => leads.find((l) => l.id === leadId) ?? null,
    [leads, leadId],
  );

  const handleSubmit = () => {
    if (!leadId || !modalityId || !datetime) return;
    const isoDate = new Date(datetime).toISOString();
    startTransition(async () => {
      const result = await scheduleClass({
        leadId,
        modalityId,
        scheduledDate: isoDate,
        notes: notes || undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Aula agendada");
      const lead = leads.find((l) => l.id === leadId)!;
      const modality = modalities.find((m) => m.id === modalityId)!;
      onCreated({
        id: result.classId,
        scheduledDate: new Date(isoDate),
        status: "SCHEDULED",
        notes: notes || null,
        modalityId,
        leadId,
        modality,
        lead: {
          id: lead.id,
          name: lead.name,
          phone: lead.phone,
          assignedSellerId: null,
          assignedSeller: null,
        },
      });
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Agendar aula experimental</DialogTitle>
        <DialogDescription>
          {format(defaultDate, "EEEE, dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
          {suggestedModalityIds.length > 0 ? (
            <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
              {suggestedModalityIds.length === 1
                ? "modalidade do horário pré-selecionada"
                : `${suggestedModalityIds.length} modalidades disponíveis nesse horário`}
            </span>
          ) : (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
              fora de horário regular da grade
            </span>
          )}
        </DialogDescription>
      </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="lead">Lead</Label>
            <Popover open={leadPickerOpen} onOpenChange={setLeadPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="lead"
                  variant="outline"
                  role="combobox"
                  aria-expanded={leadPickerOpen}
                  disabled={pending}
                  className="w-full justify-between font-normal"
                >
                  <span className={cn("truncate", !selectedLead && "text-muted-foreground")}>
                    {selectedLead ? selectedLead.name : "Buscar lead pelo nome…"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command
                  filter={(value, search) =>
                    value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                  }
                >
                  <CommandInput placeholder="Digite o nome…" />
                  <CommandList>
                    <CommandEmpty>Nenhum lead encontrado.</CommandEmpty>
                    <CommandGroup>
                      {sortedLeads.map((l) => (
                        <CommandItem
                          key={l.id}
                          // value alimenta o filtro de busca — nome + telefone
                          value={`${l.name} ${l.phone ?? ""}`}
                          onSelect={() => {
                            setLeadId(l.id);
                            setLeadPickerOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              leadId === l.id ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="flex-1 truncate">{l.name}</span>
                          {l.phone ? (
                            <span className="ml-2 text-xs text-muted-foreground">{l.phone}</span>
                          ) : null}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1">
            <Label htmlFor="modality">Modalidade</Label>
            <Select value={modalityId} onValueChange={setModalityId} disabled={pending}>
              <SelectTrigger id="modality">
                <SelectValue placeholder="Escolha…" />
              </SelectTrigger>
              <SelectContent>
                {sortedModalities.map((m) => {
                  const isSuggested = suggestedModalityIds.includes(m.id);
                  return (
                    <SelectItem key={m.id} value={m.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: m.color ?? "#6B7280" }}
                          aria-hidden
                        />
                        {m.name}
                        {isSuggested ? (
                          <span className="text-xs text-primary">· nesse horário</span>
                        ) : null}
                      </span>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="datetime">Data e hora</Label>
            <Input
              id="datetime"
              type="datetime-local"
              value={datetime}
              onChange={(e) => setDatetime(e.target.value)}
              disabled={pending}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="opcional"
              disabled={pending}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!leadId || !modalityId || !datetime || pending}
          >
            {pending ? "Agendando…" : "Agendar"}
          </Button>
        </DialogFooter>
    </>
  );
}

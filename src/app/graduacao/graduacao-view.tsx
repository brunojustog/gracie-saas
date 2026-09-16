"use client";

import { Check, ChevronsUpDown, Clock, Plus, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { ALL_BELTS } from "@/lib/belts";
import { cn } from "@/lib/utils";

import { bookExam, cancelExam } from "./actions";
import type { ExamDay, ExamSlot } from "@/server/graduation-exams";

type Aluno = {
  id: string;
  nome: string;
  matricula: string | null;
  belt: string | null;
  beltDegree: number | null;
  nextBelt: string | null;
  nextBeltDegree: number | null;
};

const beltLabel = (belt: string | null, grau: number | null | undefined) =>
  belt ? `${belt}${grau ? ` ${grau}º` : ""}` : "—";

const ddmm = (dateStr: string) => {
  const [, m, d] = dateStr.split("-");
  return `${d}/${m}`;
};

export function GraduacaoView({
  schedule,
  alunos,
  window: win,
}: {
  schedule: ExamDay[];
  alunos: Aluno[];
  window: { start: string; end: string };
}) {
  const [target, setTarget] = useState<{ iso: string; time: string; dateLabel: string } | null>(null);

  const totalBooked = schedule.reduce(
    (s, d) => s + d.slots.filter((sl) => sl.exam).length,
    0,
  );

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Janela de provas: <b>{ddmm(win.start)}</b> a <b>{ddmm(win.end)}</b> ·{" "}
        {totalBooked} prova{totalBooked === 1 ? "" : "s"} agendada{totalBooked === 1 ? "" : "s"}.
        Horários fixos: seg–sex 08/10/13/16h · sáb 08/11h.
      </div>

      {schedule.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sem dias de prova na janela configurada.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {schedule.map((day) => (
            <div key={day.dateStr} className="rounded-lg border bg-card">
              <div className="flex items-baseline justify-between border-b px-3 py-2">
                <span className="font-semibold">{day.label}</span>
                <span className="text-xs text-muted-foreground">{ddmm(day.dateStr)}</span>
              </div>
              <ul className="divide-y">
                {day.slots.map((slot) => (
                  <SlotRow
                    key={slot.iso}
                    slot={slot}
                    onBook={() =>
                      setTarget({ iso: slot.iso, time: slot.time, dateLabel: `${day.label} ${ddmm(day.dateStr)}` })
                    }
                  />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <BookDialog target={target} alunos={alunos} onClose={() => setTarget(null)} />
    </div>
  );
}

function SlotRow({ slot, onBook }: { slot: ExamSlot; onBook: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const cancel = () =>
    startTransition(async () => {
      if (!slot.exam) return;
      if (!window.confirm("Cancelar este agendamento de prova?")) return;
      const r = await cancelExam({ id: slot.exam.id });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Agendamento cancelado");
      router.refresh();
    });

  if (!slot.exam) {
    return (
      <li className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> {slot.time}
        </span>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onBook}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Agendar
        </Button>
      </li>
    );
  }

  return (
    <li className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 font-medium">
          <Clock className="h-3.5 w-3.5 text-muted-foreground" /> {slot.time}
          <span className="truncate">· {slot.exam.alunoNome}</span>
        </div>
        <div className="pl-5 text-xs text-muted-foreground">
          {slot.exam.targetBelt ? `→ ${beltLabel(slot.exam.targetBelt, slot.exam.targetBeltDegree)}` : "faixa a definir"}
          {slot.exam.notes ? ` · ${slot.exam.notes}` : ""}
        </div>
      </div>
      <Button
        size="sm"
        variant="ghost"
        className="h-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={cancel}
        disabled={pending}
        title="Cancelar agendamento"
      >
        <Trash2 className="h-4 w-4" />
      </Button>
    </li>
  );
}

function BookDialog({
  target,
  alunos,
  onClose,
}: {
  target: { iso: string; time: string; dateLabel: string } | null;
  alunos: Aluno[];
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target ? <BookForm target={target} alunos={alunos} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function BookForm({
  target,
  alunos,
  onClose,
}: {
  target: { iso: string; time: string; dateLabel: string };
  alunos: Aluno[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [alunoId, setAlunoId] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [belt, setBelt] = useState("");
  const [grau, setGrau] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const selected = useMemo(() => alunos.find((a) => a.id === alunoId) ?? null, [alunos, alunoId]);

  const pick = (a: Aluno) => {
    setAlunoId(a.id);
    setPickerOpen(false);
    // prefilla a faixa sugerida (próxima graduação)
    setBelt(a.nextBelt ?? a.belt ?? "");
    setGrau(a.nextBeltDegree != null ? String(a.nextBeltDegree) : "");
  };

  const save = () => {
    if (!alunoId) return void toast.error("Escolha o aluno");
    startTransition(async () => {
      const r = await bookExam({
        scheduledAt: target.iso,
        alunoId,
        targetBelt: belt || null,
        targetBeltDegree: grau ? Number(grau) : null,
        notes: notes || null,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Prova agendada");
      router.refresh();
      onClose();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Agendar prova · {target.dateLabel} às {target.time}</DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label>Aluno</Label>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="h-9 w-full justify-between font-normal">
                <span className={cn("truncate", !selected && "text-muted-foreground")}>
                  {selected ? selected.nome : "Buscar aluno…"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}>
                <CommandInput placeholder="Digite o nome…" />
                <CommandList>
                  <CommandEmpty>Nenhum aluno encontrado.</CommandEmpty>
                  <CommandGroup>
                    {alunos.map((a) => (
                      <CommandItem key={a.id} value={`${a.nome} ${a.matricula ?? ""}`} onSelect={() => pick(a)}>
                        <Check className={cn("mr-2 h-4 w-4", alunoId === a.id ? "opacity-100" : "opacity-0")} />
                        <span className="flex-1 truncate">{a.nome}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{beltLabel(a.belt, a.beltDegree)}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          {selected ? (
            <p className="text-[11px] text-muted-foreground">
              Faixa atual: {beltLabel(selected.belt, selected.beltDegree)}
              {selected.nextBelt ? ` · sugerida: ${beltLabel(selected.nextBelt, selected.nextBeltDegree)}` : ""}
            </p>
          ) : null}
        </div>

        <div className="grid grid-cols-[1fr_90px] gap-2">
          <div className="space-y-1">
            <Label>Faixa da prova</Label>
            <Select value={belt} onValueChange={setBelt} disabled={pending}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                {ALL_BELTS.map((b) => (
                  <SelectItem key={b} value={b}>{b}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="grau">Grau</Label>
            <Input
              id="grau"
              value={grau}
              onChange={(e) => setGrau(e.target.value.replace(/[^0-9]/g, ""))}
              inputMode="numeric"
              placeholder="0"
              disabled={pending}
            />
          </div>
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
        <Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
        <Button onClick={save} disabled={pending}>{pending ? "Agendando…" : "Agendar prova"}</Button>
      </DialogFooter>
    </>
  );
}

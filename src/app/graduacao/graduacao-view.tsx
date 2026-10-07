"use client";

import { Check, ChevronsUpDown, Clock, DollarSign, Plus, Search, Trash2 } from "lucide-react";
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
import { PAYMENT_METHOD_LABELS, PAYMENT_METHOD_ORDER } from "@/lib/payment-methods";
import type { PaymentMethod } from "@prisma/client";

import { bookExam, cancelExam, setExamPayment } from "./actions";
import type { ExamDay, ExamSlot } from "@/server/graduation-exams";

const PAYMENTS: Array<{ value: string; label: string }> = [
  { value: "PIX", label: "Pix" },
  { value: "CREDIT_CARD", label: "Cartão" },
  { value: "CASH", label: "Dinheiro" },
  { value: "BOLETO", label: "Boleto" },
  { value: "TRANSFER", label: "Transferência" },
  { value: "OTHER", label: "Outro" },
];
const payLabel = (m: string | null) =>
  PAYMENTS.find((p) => p.value === m)?.label ?? (m ? m : "");

type PayFilter = "all" | "paid" | "unpaid";

type Aluno = {
  id: string;
  nome: string;
  matricula: string | null;
  belt: string | null;
  beltDegree: number | null;
  beltSize: string | null;
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
  canManagePayments,
}: {
  schedule: ExamDay[];
  alunos: Aluno[];
  window: { start: string; end: string };
  canManagePayments: boolean;
}) {
  const [target, setTarget] = useState<{ iso: string; time: string; dateLabel: string } | null>(null);
  const [query, setQuery] = useState("");
  const [payFilter, setPayFilter] = useState<PayFilter>("all");

  const totalBooked = schedule.reduce(
    (s, d) => s + d.slots.filter((sl) => sl.exam).length,
    0,
  );
  // v1.2-BW: contagem de pagamento das provas agendadas.
  const paidCount = schedule.reduce(
    (s, d) => s + d.slots.filter((sl) => sl.exam?.paid).length,
    0,
  );
  const unpaidCount = totalBooked - paidCount;

  // v1.2-BX: consolidado das provas PAGAS por forma de pagamento (com os nomes).
  const paidNamesByMethod = useMemo(() => {
    const m = new Map<PaymentMethod, string[]>();
    for (const d of schedule) {
      for (const sl of d.slots) {
        if (sl.exam?.paid) {
          const k = (sl.exam.paymentMethod as PaymentMethod | null) ?? "OTHER";
          const arr = m.get(k) ?? [];
          arr.push(sl.exam.alunoNome);
          m.set(k, arr);
        }
      }
    }
    return m;
  }, [schedule]);
  // v1.2-BY: forma expandida (clicou pra ver os nomes).
  const [openMethod, setOpenMethod] = useState<PaymentMethod | null>(null);

  // Filtro por situação de pagamento (aplicado aos slots com prova; esconde
  // os slots vazios quando um filtro está ativo).
  const filteredSchedule = useMemo(() => {
    if (payFilter === "all") return schedule;
    return schedule
      .map((d) => ({
        ...d,
        slots: d.slots.filter((sl) =>
          sl.exam ? (payFilter === "paid" ? sl.exam.paid : !sl.exam.paid) : false,
        ),
      }))
      .filter((d) => d.slots.length > 0);
  }, [schedule, payFilter]);

  // v1.2-BN: busca por nome — mostra quando o aluno agendou.
  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return [];
    const rows: { alunoNome: string; when: string; time: string; belt: string | null; grau: number | null; size: string | null }[] = [];
    for (const day of schedule) {
      for (const sl of day.slots) {
        if (sl.exam && sl.exam.alunoNome.toLowerCase().includes(q)) {
          rows.push({
            alunoNome: sl.exam.alunoNome,
            when: `${day.label} ${ddmm(day.dateStr)}`,
            time: sl.time,
            belt: sl.exam.targetBelt,
            grau: sl.exam.targetBeltDegree,
            size: sl.exam.beltSize,
          });
        }
      }
    }
    return rows;
  }, [q, schedule]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
        Janela de provas: <b>{ddmm(win.start)}</b> a <b>{ddmm(win.end)}</b> ·{" "}
        {totalBooked} prova{totalBooked === 1 ? "" : "s"} agendada{totalBooked === 1 ? "" : "s"}.
        Horários fixos: seg–sex 08/10/13/16h · sáb 08/11h.
      </div>

      {/* v1.2-BW: painel de pagamento das taxas de prova (clicável = filtra). */}
      {totalBooked > 0 ? (
        <div className="grid grid-cols-3 gap-2">
          <PayChip
            active={payFilter === "all"}
            onClick={() => setPayFilter("all")}
            label="Agendadas"
            count={totalBooked}
            tone="neutral"
          />
          <PayChip
            active={payFilter === "paid"}
            onClick={() => setPayFilter(payFilter === "paid" ? "all" : "paid")}
            label="Pagas"
            count={paidCount}
            tone="green"
          />
          <PayChip
            active={payFilter === "unpaid"}
            onClick={() => setPayFilter(payFilter === "unpaid" ? "all" : "unpaid")}
            label="A pagar"
            count={unpaidCount}
            tone="amber"
          />
        </div>
      ) : null}

      {/* v1.2-BX/BY: consolidado por forma de pagamento (clicável → nomes). */}
      {paidCount > 0 ? (
        <div className="space-y-1.5 rounded-lg border bg-muted/30 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
            <span className="font-medium text-foreground">Pagas por forma:</span>
            {PAYMENT_METHOD_ORDER.filter((m) => (paidNamesByMethod.get(m)?.length ?? 0) > 0).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setOpenMethod(openMethod === m ? null : m)}
                className={cn(
                  "rounded-full border px-2 py-0.5 transition-colors hover:bg-background",
                  openMethod === m && "bg-background ring-1 ring-primary",
                )}
              >
                {PAYMENT_METHOD_LABELS[m]}{" "}
                <b className="text-foreground">{paidNamesByMethod.get(m)?.length}</b>
              </button>
            ))}
          </div>
          {openMethod ? (
            <ul className="flex flex-wrap gap-x-3 gap-y-0.5 border-t pt-1.5 text-muted-foreground">
              {(paidNamesByMethod.get(openMethod) ?? []).map((nome, i) => (
                <li key={`${nome}-${i}`}>• {nome}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {/* Busca por nome: ver se/quando o aluno agendou */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar aluno pra ver se agendou…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        {q ? (
          matches.length === 0 ? (
            <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
              Nenhuma prova agendada pra “{query}”.
            </p>
          ) : (
            <ul className="divide-y rounded-md border bg-card text-sm">
              {matches.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="font-medium">{m.alunoNome}</span>
                    <span className="text-muted-foreground">
                      {" "}· {m.when} às {m.time}
                      {m.belt ? ` · ${beltLabel(m.belt, m.grau)}` : ""}
                      {m.size ? ` · faixa tam ${m.size}` : ""}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )
        ) : null}
      </div>

      {schedule.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Sem dias de prova na janela configurada.
        </p>
      ) : filteredSchedule.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {payFilter === "paid" ? "Nenhuma prova paga." : "Nenhuma prova a pagar."}
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredSchedule.map((day) => (
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
                    canManagePayments={canManagePayments}
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

function PayChip({
  active,
  onClick,
  label,
  count,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  tone: "neutral" | "green" | "amber";
}) {
  const toneCls =
    tone === "green"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : "text-foreground";
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card px-3 py-2 text-center transition-colors hover:bg-muted/50",
        active && "ring-2 ring-primary",
      )}
    >
      <div className={cn("text-xl font-semibold tabular-nums", toneCls)}>{count}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </button>
  );
}

function SlotRow({
  slot,
  onBook,
  canManagePayments,
}: {
  slot: ExamSlot;
  onBook: () => void;
  canManagePayments: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [payOpen, setPayOpen] = useState(false);
  const [method, setMethod] = useState("PIX");

  const cancel = () =>
    startTransition(async () => {
      if (!slot.exam) return;
      if (!window.confirm("Cancelar este agendamento de prova?")) return;
      const r = await cancelExam({ id: slot.exam.id });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Agendamento cancelado");
      router.refresh();
    });

  const markPaid = () =>
    startTransition(async () => {
      if (!slot.exam) return;
      const r = await setExamPayment({ id: slot.exam.id, paid: true, paymentMethod: method });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Pagamento registrado");
      setPayOpen(false);
      router.refresh();
    });

  const unmarkPaid = () =>
    startTransition(async () => {
      if (!slot.exam) return;
      const r = await setExamPayment({ id: slot.exam.id, paid: false });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Pagamento desmarcado");
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

  const exam = slot.exam;

  return (
    <li className="space-y-1.5 px-3 py-2 text-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium">
            <Clock className="h-3.5 w-3.5 text-muted-foreground" /> {slot.time}
            <span className="truncate">· {exam.alunoNome}</span>
          </div>
          <div className="pl-5 text-xs text-muted-foreground">
            {exam.targetBelt ? `→ ${beltLabel(exam.targetBelt, exam.targetBeltDegree)}` : "faixa a definir"}
            {exam.beltSize ? ` · tam ${exam.beltSize}` : ""}
            {exam.notes ? ` · ${exam.notes}` : ""}
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
      </div>

      {/* v1.2-BW: situação do pagamento + controle (só ADM/gerente edita). */}
      <div className="flex items-center justify-between gap-2 pl-5">
        {exam.paid ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
            <DollarSign className="h-3 w-3" /> Pago{exam.paymentMethod ? ` · ${payLabel(exam.paymentMethod)}` : ""}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-400">
            <DollarSign className="h-3 w-3" /> A pagar
          </span>
        )}

        {canManagePayments ? (
          exam.paid ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px] text-muted-foreground"
              onClick={unmarkPaid}
              disabled={pending}
            >
              Desmarcar
            </Button>
          ) : payOpen ? (
            <span className="flex items-center gap-1">
              <Select value={method} onValueChange={setMethod} disabled={pending}>
                <SelectTrigger className="h-7 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENTS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-7 text-[11px]" onClick={markPaid} disabled={pending}>
                OK
              </Button>
            </span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px]"
              onClick={() => setPayOpen(true)}
              disabled={pending}
            >
              Marcar pago
            </Button>
          )
        ) : null}
      </div>
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
  const [beltSizeVal, setBeltSizeVal] = useState("");
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const selected = useMemo(() => alunos.find((a) => a.id === alunoId) ?? null, [alunos, alunoId]);

  const pick = (a: Aluno) => {
    setAlunoId(a.id);
    setPickerOpen(false);
    // prefilla a faixa sugerida (próxima graduação) e o tamanho já cadastrado
    setBelt(a.nextBelt ?? a.belt ?? "");
    setGrau(a.nextBeltDegree != null ? String(a.nextBeltDegree) : "");
    setBeltSizeVal(a.beltSize ?? "");
  };

  const save = () => {
    if (!alunoId) return void toast.error("Escolha o aluno");
    startTransition(async () => {
      const r = await bookExam({
        scheduledAt: target.iso,
        alunoId,
        targetBelt: belt || null,
        targetBeltDegree: grau ? Number(grau) : null,
        beltSize: beltSizeVal || null,
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
          <Label htmlFor="beltSize">Tamanho da faixa</Label>
          <Input
            id="beltSize"
            value={beltSizeVal}
            onChange={(e) => setBeltSizeVal(e.target.value)}
            placeholder="ex: A3, M2, 3"
            disabled={pending}
          />
          <p className="text-[11px] text-muted-foreground">
            Fica salvo no cadastro do aluno (reusa nas próximas graduações).
          </p>
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

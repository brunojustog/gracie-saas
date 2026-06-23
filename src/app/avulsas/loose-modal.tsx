"use client";

import type { PaymentMethod } from "@prisma/client";
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

import { createLooseClass } from "./actions";

export type LooseFormOptions = {
  modalities: Array<{ id: string; name: string }>;
  leads: Array<{ id: string; name: string; phone: string | null }>;
  sellers: Array<{ id: string; name: string }>;
};

const NONE = "__none__";
const PAYMENTS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "PIX", label: "Pix" },
  { value: "CREDIT_CARD", label: "Cartão" },
  { value: "CASH", label: "Dinheiro" },
  { value: "BOLETO", label: "Boleto" },
  { value: "TRANSFER", label: "Transferência" },
  { value: "OTHER", label: "Outro" },
];

const todayISO = () => new Date().toISOString().slice(0, 10);

export function LooseModal({
  open,
  onOpenChange,
  options,
  hideFinancials = false,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  options: LooseFormOptions;
  hideFinancials?: boolean;
  onSaved?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <Body
            key="new"
            options={options}
            hideFinancials={hideFinancials}
            onClose={() => onOpenChange(false)}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  options,
  hideFinancials,
  onClose,
  onSaved,
}: {
  options: LooseFormOptions;
  hideFinancials: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [leadId, setLeadId] = useState("");
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [modalityId, setModalityId] = useState(NONE);
  const [value, setValue] = useState("");
  const [classDate, setClassDate] = useState(todayISO());
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | typeof NONE>(NONE);
  const [soldById, setSoldById] = useState(NONE);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const sortedLeads = useMemo(
    () => [...options.leads].sort((a, b) => a.name.localeCompare(b.name)),
    [options.leads],
  );
  const selectedLead = sortedLeads.find((l) => l.id === leadId) ?? null;

  const handleSubmit = () => {
    if (!leadId) {
      toast.error("Escolha o aluno");
      return;
    }
    const val = hideFinancials ? 0 : Number(value.replace(",", "."));
    if (!hideFinancials && (!Number.isFinite(val) || val < 0)) {
      toast.error("Valor inválido");
      return;
    }
    startTransition(async () => {
      const result = await createLooseClass({
        leadId,
        modalityId: modalityId === NONE ? null : modalityId,
        value: val,
        classDate,
        paymentMethod: paymentMethod === NONE ? null : paymentMethod,
        soldById: soldById === NONE ? null : soldById,
        notes: notes.trim() || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Aula avulsa registrada");
      onSaved?.();
      onClose();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Nova aula avulsa</DialogTitle>
        <DialogDescription>
          Pessoa paga uma aula só — não gera matrícula nem pacote.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="lc-lead">Aluno</Label>
          <Popover open={leadPickerOpen} onOpenChange={setLeadPickerOpen}>
            <PopoverTrigger asChild>
              <Button
                id="lc-lead"
                variant="outline"
                role="combobox"
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
              <Command filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}>
                <CommandInput placeholder="Digite o nome…" />
                <CommandList>
                  <CommandEmpty>Nenhum lead encontrado.</CommandEmpty>
                  <CommandGroup>
                    {sortedLeads.map((l) => (
                      <CommandItem
                        key={l.id}
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="lc-date">Data da aula</Label>
            <Input
              id="lc-date"
              type="date"
              value={classDate}
              onChange={(e) => setClassDate(e.target.value)}
              disabled={pending}
            />
          </div>
          {hideFinancials ? null : (
            <div className="space-y-1">
              <Label htmlFor="lc-value">Valor (R$)</Label>
              <Input
                id="lc-value"
                type="number"
                step="0.01"
                min="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={pending}
              />
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="lc-modality">Modalidade</Label>
            <Select value={modalityId} onValueChange={setModalityId} disabled={pending}>
              <SelectTrigger id="lc-modality">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {options.modalities.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="lc-payment">Pagamento</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as PaymentMethod | typeof NONE)}
              disabled={pending}
            >
              <SelectTrigger id="lc-payment">
                <SelectValue placeholder="—" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>—</SelectItem>
                {PAYMENTS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="lc-seller">Vendedora</Label>
          <Select value={soldById} onValueChange={setSoldById} disabled={pending}>
            <SelectTrigger id="lc-seller">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>(sem vendedora)</SelectItem>
              {options.sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label htmlFor="lc-notes">Observações</Label>
          <Textarea
            id="lc-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="opcional"
            disabled={pending}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit} disabled={pending}>
          {pending ? "Salvando…" : "Registrar aula avulsa"}
        </Button>
      </DialogFooter>
    </>
  );
}

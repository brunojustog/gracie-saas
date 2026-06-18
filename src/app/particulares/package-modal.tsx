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

import { createPrivatePackage, updatePrivatePackage } from "./actions";

export type FormOptions = {
  modalities: Array<{ id: string; name: string }>;
  leads: Array<{ id: string; name: string; phone: string | null }>;
  sellers: Array<{ id: string; name: string }>;
};

export type EditPackage = {
  id: string;
  leadName: string;
  modalityId: string | null;
  totalClasses: number;
  value: number | null;
  paymentMethod: PaymentMethod | null;
  startDate: string;
  endDate: string | null;
  soldById: string | null;
  notes: string | null;
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

export function PackageModal({
  open,
  onOpenChange,
  options,
  editing,
  hideFinancials = false,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  options: FormOptions;
  editing?: EditPackage | null;
  hideFinancials?: boolean;
  onSaved?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <Body
            key={editing?.id ?? "new"}
            options={options}
            editing={editing ?? null}
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
  editing,
  hideFinancials,
  onClose,
  onSaved,
}: {
  options: FormOptions;
  editing: EditPackage | null;
  hideFinancials: boolean;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [leadId, setLeadId] = useState("");
  const [leadPickerOpen, setLeadPickerOpen] = useState(false);
  const [modalityId, setModalityId] = useState(editing?.modalityId ?? NONE);
  const [totalClasses, setTotalClasses] = useState(String(editing?.totalClasses ?? 4));
  const [value, setValue] = useState(editing?.value != null ? String(editing.value) : "");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | typeof NONE>(
    editing?.paymentMethod ?? NONE,
  );
  const [startDate, setStartDate] = useState(editing?.startDate ?? todayISO());
  const [endDate, setEndDate] = useState(editing?.endDate ?? "");
  const [soldById, setSoldById] = useState(editing?.soldById ?? NONE);
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [pending, startTransition] = useTransition();

  const sortedLeads = useMemo(
    () => [...options.leads].sort((a, b) => a.name.localeCompare(b.name)),
    [options.leads],
  );
  const selectedLead = sortedLeads.find((l) => l.id === leadId) ?? null;

  const handleSubmit = () => {
    const total = Number(totalClasses);
    if (!Number.isInteger(total) || total < 1) {
      toast.error("Número de aulas inválido");
      return;
    }
    const val = hideFinancials ? 0 : Number(value.replace(",", "."));
    if (!hideFinancials && (!Number.isFinite(val) || val < 0)) {
      toast.error("Valor inválido");
      return;
    }
    if (!editing && !leadId) {
      toast.error("Escolha o aluno");
      return;
    }

    const common = {
      modalityId: modalityId === NONE ? null : modalityId,
      totalClasses: total,
      value: val,
      paymentMethod: paymentMethod === NONE ? null : paymentMethod,
      startDate,
      endDate: endDate || null,
      soldById: soldById === NONE ? null : soldById,
      notes: notes.trim() || null,
    };

    startTransition(async () => {
      const result = editing
        ? await updatePrivatePackage({ packageId: editing.id, ...common })
        : await createPrivatePackage({ leadId, ...common });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(editing ? "Pacote atualizado" : "Pacote criado");
      onSaved?.();
      onClose();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? "Editar pacote" : "Novo pacote de aulas"}</DialogTitle>
        <DialogDescription>
          {editing
            ? editing.leadName
            : "Aulas particulares avulsas — não geram matrícula."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        {!editing ? (
          <div className="space-y-1">
            <Label htmlFor="pkg-lead">Aluno</Label>
            <Popover open={leadPickerOpen} onOpenChange={setLeadPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  id="pkg-lead"
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
                <Command
                  filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}
                >
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
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="pkg-total">Nº de aulas contratadas</Label>
            <Input
              id="pkg-total"
              type="number"
              min="1"
              value={totalClasses}
              onChange={(e) => setTotalClasses(e.target.value)}
              disabled={pending}
            />
          </div>
          {hideFinancials ? null : (
            <div className="space-y-1">
              <Label htmlFor="pkg-value">Valor do pacote (R$)</Label>
              <Input
                id="pkg-value"
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
            <Label htmlFor="pkg-modality">Modalidade</Label>
            <Select value={modalityId} onValueChange={setModalityId} disabled={pending}>
              <SelectTrigger id="pkg-modality">
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
            <Label htmlFor="pkg-payment">Pagamento</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as PaymentMethod | typeof NONE)}
              disabled={pending}
            >
              <SelectTrigger id="pkg-payment">
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

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="pkg-start">Início</Label>
            <Input
              id="pkg-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pkg-end">Término previsto</Label>
            <Input
              id="pkg-end"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="pkg-seller">Vendedora</Label>
          <Select value={soldById} onValueChange={setSoldById} disabled={pending}>
            <SelectTrigger id="pkg-seller">
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
          <Label htmlFor="pkg-notes">Observações</Label>
          <Textarea
            id="pkg-notes"
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
          {pending ? "Salvando…" : editing ? "Salvar" : "Criar pacote"}
        </Button>
      </DialogFooter>
    </>
  );
}

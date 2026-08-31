"use client";

import type { PaymentMethod } from "@prisma/client";
import { format } from "date-fns";
import { Check, ChevronsUpDown, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
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

import {
  createPrivatePackage,
  deleteRenewal,
  registerRenewal,
  updatePrivatePackage,
} from "./actions";

export type FormOptions = {
  modalities: Array<{ id: string; name: string }>;
  leads: Array<{ id: string; name: string; phone: string | null }>;
  sellers: Array<{ id: string; name: string }>;
  // v1.1-BZ: professores ativos pro select de "quem deu a aula".
  professors: Array<{ id: string; name: string }>;
};

export type RenewalRow = {
  id: string;
  paidAt: Date | string;
  classesAdded: number;
  value: number | string | null;
  note: string | null;
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
  // v1.2-AG: recorrência (editável aqui, no "Editar pacote").
  recurring: boolean;
  recurringDay: number | null;
  recurringClasses: number | null;
  renewals: RenewalRow[];
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
  const router = useRouter();

  // Recorrência (v1.2-AG).
  const [recurring, setRecurring] = useState(editing?.recurring ?? false);
  const [recDay, setRecDay] = useState(editing?.recurringDay ? String(editing.recurringDay) : "");
  const [recClasses, setRecClasses] = useState(
    editing?.recurringClasses ? String(editing.recurringClasses) : "",
  );
  const [renewals, setRenewals] = useState<RenewalRow[]>(editing?.renewals ?? []);
  const [localTotal, setLocalTotal] = useState(editing?.totalClasses ?? 0);
  const [renewDate, setRenewDate] = useState(todayISO());
  const [renewClasses, setRenewClasses] = useState(
    editing?.recurringClasses ? String(editing.recurringClasses) : "",
  );
  const [renewValue, setRenewValue] = useState("");

  const nextChargeLabel = (day: number): string => {
    const now = new Date();
    let y = now.getFullYear();
    let m = now.getMonth();
    if (now.getDate() >= day) {
      m++;
      if (m > 11) { m = 0; y++; }
    }
    return new Date(y, m, Math.min(day, 28)).toLocaleDateString("pt-BR");
  };

  const doRegisterRenewal = () => {
    if (!editing) return;
    const cls = Number(renewClasses);
    if (!renewDate) return void toast.error("Informe a data do pagamento");
    if (!cls || cls < 1) return void toast.error("Informe quantas aulas entraram");
    startTransition(async () => {
      const r = await registerRenewal({
        packageId: editing.id,
        paidAt: renewDate,
        classesAdded: cls,
        value: renewValue ? Number(renewValue) : null,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`+${cls} aulas adicionadas ao saldo`);
      // Reflete na hora, sem reabrir o modal.
      setRenewals((prev) => [
        { id: `tmp-${Date.now()}`, paidAt: renewDate, classesAdded: cls, value: renewValue ? Number(renewValue) : null, note: null },
        ...prev,
      ]);
      setLocalTotal((t) => t + cls);
      setTotalClasses((t) => String(Number(t) + cls));
      setRenewValue("");
      router.refresh();
      onSaved?.();
    });
  };

  const removeRenewal = (id: string) => {
    if (!editing) return;
    startTransition(async () => {
      const r = await deleteRenewal({ packageId: editing.id, renewalId: id });
      if (!r.ok) return void toast.error(r.error);
      const removed = renewals.find((x) => x.id === id);
      setRenewals((prev) => prev.filter((x) => x.id !== id));
      if (removed) {
        setLocalTotal((t) => Math.max(0, t - removed.classesAdded));
        setTotalClasses((t) => String(Math.max(1, Number(t) - removed.classesAdded)));
      }
      toast.success("Cobrança removida");
      router.refresh();
      onSaved?.();
    });
  };

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
      recurring,
      recurringDay: recurring && recDay ? Number(recDay) : null,
      recurringClasses: recurring && recClasses ? Number(recClasses) : null,
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

        {/* Recorrência (v1.2-AG): cobrança do cartão a cada ciclo. */}
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              disabled={pending}
            />
            <RefreshCw className="h-3.5 w-3.5" /> Pacote recorrente (cartão cobrado por ciclo)
          </label>

          {recurring ? (
            <>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-24 space-y-1">
                  <span className="text-[11px] text-muted-foreground">Dia da cobrança</span>
                  <Input type="number" min={1} max={31} value={recDay} onChange={(e) => setRecDay(e.target.value)} disabled={pending} placeholder="23" />
                </div>
                <div className="w-28 space-y-1">
                  <span className="text-[11px] text-muted-foreground">Aulas por ciclo</span>
                  <Input type="number" min={1} max={500} value={recClasses} onChange={(e) => setRecClasses(e.target.value)} disabled={pending} placeholder="8" />
                </div>
                {recDay ? (
                  <p className="pb-2 text-[11px] text-muted-foreground">
                    Próxima: <b>{nextChargeLabel(Number(recDay))}</b>
                  </p>
                ) : null}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Salve o pacote pra guardar a configuração da recorrência.
              </p>

              {editing ? (
                <>
                  {/* Registrar cobrança — soma as aulas ao saldo na hora. */}
                  <div className="space-y-1 rounded-md border bg-background p-2">
                    <span className="text-[11px] font-medium">
                      Registrar cobrança <span className="text-muted-foreground">(saldo atual: {localTotal} aulas)</span>
                    </span>
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="flex-1 space-y-1">
                        <span className="text-[11px] text-muted-foreground">Data do pagamento</span>
                        <Input type="date" value={renewDate} onChange={(e) => setRenewDate(e.target.value)} disabled={pending} />
                      </div>
                      <div className="w-16 space-y-1">
                        <span className="text-[11px] text-muted-foreground">Aulas</span>
                        <Input type="number" min={1} value={renewClasses} onChange={(e) => setRenewClasses(e.target.value)} disabled={pending} placeholder="8" />
                      </div>
                      {hideFinancials ? null : (
                        <div className="w-24 space-y-1">
                          <span className="text-[11px] text-muted-foreground">Valor (opc.)</span>
                          <Input type="number" min={0} step="0.01" value={renewValue} onChange={(e) => setRenewValue(e.target.value)} disabled={pending} placeholder="R$" />
                        </div>
                      )}
                      <Button type="button" size="sm" onClick={doRegisterRenewal} disabled={pending}>
                        <Plus className="mr-1 h-4 w-4" /> Registrar
                      </Button>
                    </div>
                  </div>

                  {renewals.length > 0 ? (
                    <ul className="space-y-1">
                      {renewals.map((rn) => (
                        <li key={rn.id} className="flex items-center gap-2 rounded border bg-background px-2 py-1 text-xs">
                          <span className="tabular-nums">{format(new Date(rn.paidAt), "dd/MM/yyyy")}</span>
                          <span className="font-medium text-emerald-700 dark:text-emerald-300">+{rn.classesAdded} aulas</span>
                          {!hideFinancials && rn.value != null ? (
                            <span className="text-muted-foreground">
                              {Number(rn.value).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                            </span>
                          ) : null}
                          <button type="button" onClick={() => removeRenewal(rn.id)} disabled={pending} className="ml-auto text-muted-foreground hover:text-red-600" aria-label="Remover cobrança" title="Remover (desfaz as aulas somadas)">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-[11px] text-muted-foreground">Nenhuma cobrança registrada ainda.</p>
                  )}
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">
                  Crie o pacote primeiro; depois registre as cobranças aqui.
                </p>
              )}
            </>
          ) : null}
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

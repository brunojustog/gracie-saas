"use client";

import { Check, ChevronsUpDown, Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { cn } from "@/lib/utils";

import { updateSale } from "../actions";

type Item = {
  id: string;
  name: string;
  label: string;
  quantity: number;
  unitPrice: number;
};
type Seller = { id: string; name: string };
type Customer = { id: string; name: string };

const NO_CUSTOMER = "__avulsa__";

const PAYMENT_METHODS = [
  { value: "PIX", label: "Pix" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "CARTAO_DEBITO", label: "Cartão débito" },
  { value: "CARTAO_CREDITO", label: "Cartão crédito" },
  { value: "CORTESIA", label: "Cortesia" },
  { value: "OUTRO", label: "Outro" },
];

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** v1.2-BH/BM: corrige preço, forma de pagamento, desconto, vendedora e aluno. */
export function EditSaleButton({
  saleId,
  items,
  paymentMethod,
  discountOn,
  sellers,
  customers,
  currentSellerId,
  currentCustomerLeadId,
}: {
  saleId: string;
  items: Item[];
  paymentMethod: string;
  discountOn: boolean;
  sellers: Seller[];
  customers: Customer[];
  currentSellerId: string;
  currentCustomerLeadId: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        title="Editar venda"
      >
        <Pencil className="h-4 w-4" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          {open ? (
            <EditForm
              saleId={saleId}
              items={items}
              paymentMethod={paymentMethod}
              initialDiscount={discountOn}
              sellers={sellers}
              customers={customers}
              currentSellerId={currentSellerId}
              currentCustomerLeadId={currentCustomerLeadId}
              onClose={() => setOpen(false)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function EditForm({
  saleId,
  items,
  paymentMethod: initialPayment,
  initialDiscount,
  sellers,
  customers,
  currentSellerId,
  currentCustomerLeadId,
  onClose,
}: {
  saleId: string;
  items: Item[];
  paymentMethod: string;
  initialDiscount: boolean;
  sellers: Seller[];
  customers: Customer[];
  currentSellerId: string;
  currentCustomerLeadId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, String(i.unitPrice)])),
  );
  const [payment, setPayment] = useState(initialPayment);
  const [discountOn, setDiscountOn] = useState(initialDiscount);
  const [sellerId, setSellerId] = useState(currentSellerId);
  const [customerId, setCustomerId] = useState(currentCustomerLeadId ?? NO_CUSTOMER);
  const [custOpen, setCustOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const selectedCustomer =
    customerId === NO_CUSTOMER ? null : customers.find((c) => c.id === customerId) ?? null;

  const gross = items.reduce(
    (s, i) => s + (Number(prices[i.id]?.replace(",", ".")) || 0) * i.quantity,
    0,
  );
  const discount = discountOn ? Math.round(gross * 0.05 * 100) / 100 : 0;
  const total = gross - discount;

  const save = () => {
    startTransition(async () => {
      const r = await updateSale({
        saleId,
        paymentMethod: payment,
        applyDiscount: discountOn,
        sellerUserId: sellerId,
        customerLeadId: customerId === NO_CUSTOMER ? null : customerId,
        items: items.map((i) => ({
          id: i.id,
          unitPrice: Number(prices[i.id]?.replace(",", ".")) || 0,
        })),
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Venda corrigida");
      router.refresh();
      onClose();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar venda</DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        {items.map((i) => (
          <div key={i.id} className="space-y-1">
            <Label htmlFor={`p-${i.id}`}>
              {i.quantity}× {i.name}
              {i.label !== "Padrão" ? ` (${i.label})` : ""}
            </Label>
            <Input
              id={`p-${i.id}`}
              value={prices[i.id] ?? ""}
              onChange={(e) => setPrices((p) => ({ ...p, [i.id]: e.target.value }))}
              inputMode="decimal"
              disabled={pending}
              placeholder="preço unitário"
            />
          </div>
        ))}

        <div className="space-y-1">
          <Label>Vendedora</Label>
          <Select value={sellerId} onValueChange={setSellerId} disabled={pending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label>Aluno</Label>
          <Popover open={custOpen} onOpenChange={setCustOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" role="combobox" className="h-9 w-full justify-between font-normal" disabled={pending}>
                <span className={cn("truncate", !selectedCustomer && "text-muted-foreground")}>
                  {selectedCustomer ? selectedCustomer.name : "Venda avulsa (sem aluno)"}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command filter={(v, s) => (v.toLowerCase().includes(s.toLowerCase()) ? 1 : 0)}>
                <CommandInput placeholder="Buscar aluno…" />
                <CommandList>
                  <CommandEmpty>Nenhum aluno encontrado.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="Venda avulsa sem aluno"
                      onSelect={() => { setCustomerId(NO_CUSTOMER); setCustOpen(false); }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", customerId === NO_CUSTOMER ? "opacity-100" : "opacity-0")} />
                      Venda avulsa (sem aluno)
                    </CommandItem>
                    {customers.map((c) => (
                      <CommandItem key={c.id} value={c.name} onSelect={() => { setCustomerId(c.id); setCustOpen(false); }}>
                        <Check className={cn("mr-2 h-4 w-4", customerId === c.id ? "opacity-100" : "opacity-0")} />
                        <span className="flex-1 truncate">{c.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>

        <div className="space-y-1">
          <Label>Pagamento</Label>
          <Select value={payment} onValueChange={setPayment} disabled={pending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={discountOn}
            onChange={(e) => setDiscountOn(e.target.checked)}
            className="h-4 w-4"
            disabled={pending}
          />
          Aplicar desconto de 5%
        </label>

        <div className="border-t pt-2 text-sm">
          {discount > 0 ? (
            <div className="flex justify-between text-muted-foreground">
              <span>Desconto (5%)</span>
              <span>− {brl(discount)}</span>
            </div>
          ) : null}
          <div className="flex justify-between font-semibold">
            <span>Total</span>
            <span>{brl(total)}</span>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={save} disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </DialogFooter>
    </>
  );
}

"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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

import { updateSale } from "../actions";

type Item = {
  id: string;
  name: string;
  label: string;
  quantity: number;
  unitPrice: number;
};

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

/** v1.2-BH: corrige preço unitário / forma de pagamento / desconto de uma venda. */
export function EditSaleButton({
  saleId,
  items,
  paymentMethod,
  discountOn: initialDiscount,
}: {
  saleId: string;
  items: Item[];
  paymentMethod: string;
  discountOn: boolean;
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
              initialDiscount={initialDiscount}
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
  onClose,
}: {
  saleId: string;
  items: Item[];
  paymentMethod: string;
  initialDiscount: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [prices, setPrices] = useState<Record<string, string>>(
    Object.fromEntries(items.map((i) => [i.id, String(i.unitPrice)])),
  );
  const [payment, setPayment] = useState(initialPayment);
  const [discountOn, setDiscountOn] = useState(initialDiscount);
  const [pending, startTransition] = useTransition();

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

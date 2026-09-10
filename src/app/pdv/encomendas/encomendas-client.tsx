"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Plus, RotateCcw, X } from "lucide-react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
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

import { createOrder, updateOrderPayment, updateOrderStatus } from "./actions";
import type { OrderRow } from "@/server/orders";

const PAY_LABEL: Record<string, string> = {
  TO_PAY: "A pagar",
  PARTIAL: "Parcial / sinal",
  PAID: "Pago",
};
const PAY_TONE: Record<string, string> = {
  TO_PAY: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  PARTIAL: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  PAID: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function EncomendasClient({ orders }: { orders: OrderRow[] }) {
  const [creating, setCreating] = useState(false);
  const [showClosed, setShowClosed] = useState(false);

  const open = orders.filter((o) => o.status === "OPEN");
  const closed = orders.filter((o) => o.status !== "OPEN");

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" />
          Nova encomenda
        </Button>
      </div>

      {creating ? <OrderForm onDone={() => setCreating(false)} /> : null}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          Abertas ({open.length})
        </h2>
        {open.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nenhuma encomenda aberta.
          </p>
        ) : (
          <ul className="space-y-2">
            {open.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))}
          </ul>
        )}
      </section>

      {closed.length > 0 ? (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="text-sm font-semibold text-muted-foreground hover:underline"
          >
            {showClosed ? "▾" : "▸"} Entregues / canceladas ({closed.length})
          </button>
          {showClosed ? (
            <ul className="space-y-2">
              {closed.map((o) => (
                <OrderCard key={o.id} order={o} />
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function OrderForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [item, setItem] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [size, setSize] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("TO_PAY");
  const [orderedAt, setOrderedAt] = useState(iso(new Date()));
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const save = () => {
    if (!item.trim()) return void toast.error("Descreva o item");
    startTransition(async () => {
      const r = await createOrder({
        item,
        customerName: customerName || null,
        size: size || null,
        amount: amount ? Number(amount.replace(",", ".")) : null,
        paymentStatus,
        orderedAt,
        notes: notes || null,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Encomenda registrada");
      router.refresh();
      onDone();
    });
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="item">Item *</Label>
          <Input
            id="item"
            value={item}
            onChange={(e) => setItem(e.target.value)}
            placeholder="ex: Kimono A3 preto"
            autoFocus
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cust">Aluno / cliente</Label>
          <Input
            id="cust"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="quem pediu"
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="size">Tamanho</Label>
          <Input
            id="size"
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder="ex: A3, M, 40"
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="amount">Valor combinado (R$)</Label>
          <Input
            id="amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="opcional"
            disabled={pending}
          />
        </div>
        <div className="space-y-1">
          <Label>Pagamento</Label>
          <Select value={paymentStatus} onValueChange={setPaymentStatus} disabled={pending}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="TO_PAY">A pagar</SelectItem>
              <SelectItem value="PARTIAL">Parcial / sinal</SelectItem>
              <SelectItem value="PAID">Pago</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="date">Data da encomenda</Label>
          <Input
            id="date"
            type="date"
            value={orderedAt}
            onChange={(e) => setOrderedAt(e.target.value)}
            disabled={pending}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="notes">Observações (o que foi combinado)</Label>
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
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone} disabled={pending}>
          Cancelar
        </Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Salvando…" : "Registrar encomenda"}
        </Button>
      </div>
    </div>
  );
}

function OrderCard({ order: o }: { order: OrderRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const setStatus = (status: "OPEN" | "FULFILLED" | "CANCELED") =>
    startTransition(async () => {
      const r = await updateOrderStatus({ id: o.id, status });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Atualizado");
      router.refresh();
    });

  const setPayment = (paymentStatus: string) =>
    startTransition(async () => {
      const r = await updateOrderPayment({ id: o.id, paymentStatus });
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });

  const closed = o.status !== "OPEN";

  return (
    <li className={`rounded-lg border bg-card p-3 ${closed ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">
            {o.item}
            {o.size ? <span className="ml-1 text-xs text-muted-foreground">· {o.size}</span> : null}
          </div>
          <div className="text-xs text-muted-foreground">
            {o.customerName ? `${o.customerName} · ` : ""}
            {format(new Date(o.orderedAt), "dd/MM/yyyy", { locale: ptBR })}
            {o.amount != null ? ` · ${brl(o.amount)}` : ""}
          </div>
          {o.notes ? <div className="mt-1 text-xs italic text-muted-foreground">“{o.notes}”</div> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {o.status === "FULFILLED" ? (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
              entregue
            </span>
          ) : o.status === "CANCELED" ? (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-900 dark:bg-red-900/40 dark:text-red-200">
              cancelada
            </span>
          ) : (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${PAY_TONE[o.paymentStatus]}`}>
              {PAY_LABEL[o.paymentStatus]}
            </span>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
        {!closed ? (
          <>
            <Select value={o.paymentStatus} onValueChange={setPayment} disabled={pending}>
              <SelectTrigger className="h-7 w-[150px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="TO_PAY">A pagar</SelectItem>
                <SelectItem value="PARTIAL">Parcial / sinal</SelectItem>
                <SelectItem value="PAID">Pago</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setStatus("FULFILLED")} disabled={pending}>
              <Check className="mr-1 h-3.5 w-3.5" /> Entregue
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setStatus("CANCELED")} disabled={pending}>
              <X className="mr-1 h-3.5 w-3.5" /> Cancelar
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setStatus("OPEN")} disabled={pending}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reabrir
          </Button>
        )}
      </div>
    </li>
  );
}

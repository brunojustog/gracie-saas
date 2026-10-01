"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, Pencil, Plus, RotateCcw, X } from "lucide-react";
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

import { createOrder, updateOrder, updateOrderStatus } from "./actions";
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
const PAY_METHODS = ["Pix", "Dinheiro", "Cartão débito", "Cartão crédito", "Outro"];
const NONE = "__none__";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ddmm = (d: Date) => format(new Date(d), "dd/MM/yyyy", { locale: ptBR });

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

function OrderForm({ order, onDone }: { order?: OrderRow; onDone: () => void }) {
  const router = useRouter();
  const editing = !!order;
  const [item, setItem] = useState(order?.item ?? "");
  const [quantity, setQuantity] = useState(String(order?.quantity ?? 1));
  const [matricula, setMatricula] = useState(order?.matricula ?? "");
  const [customerName, setCustomerName] = useState(order?.customerName ?? "");
  const [size, setSize] = useState(order?.size ?? "");
  const [progress, setProgress] = useState(order?.progress ?? "");
  const [amount, setAmount] = useState(order?.amount != null ? String(order.amount) : "");
  const [paymentMethod, setPaymentMethod] = useState(order?.paymentMethod ?? NONE);
  const [paymentStatus, setPaymentStatus] = useState<string>(order?.paymentStatus ?? "TO_PAY");
  const [orderedAt, setOrderedAt] = useState(iso(order ? new Date(order.orderedAt) : new Date()));
  const [pickupAt, setPickupAt] = useState(order?.pickupAt ? iso(new Date(order.pickupAt)) : "");
  const [notes, setNotes] = useState(order?.notes ?? "");
  const [pending, startTransition] = useTransition();

  const save = () => {
    if (!item.trim()) return void toast.error("Descreva o item");
    startTransition(async () => {
      const payload = {
        item,
        quantity: Number(quantity) || 1,
        matricula: matricula || null,
        customerName: customerName || null,
        size: size || null,
        progress: progress || null,
        amount: amount ? Number(amount.replace(",", ".")) : null,
        paymentMethod: paymentMethod === NONE ? null : paymentMethod,
        paymentStatus,
        pickupAt: pickupAt || null,
        notes: notes || null,
      };
      const r = editing
        ? await updateOrder({ id: order!.id, ...payload })
        : await createOrder({ ...payload, orderedAt });
      if (!r.ok) return void toast.error(r.error);
      toast.success(editing ? "Encomenda atualizada" : "Encomenda registrada");
      router.refresh();
      onDone();
    });
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="item">Produto *</Label>
          <Input id="item" value={item} onChange={(e) => setItem(e.target.value)} placeholder="ex: Kimono preto" autoFocus disabled={pending} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="qty">Quantidade</Label>
          <Input id="qty" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="1" disabled={pending} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="size">Tamanho</Label>
          <Input id="size" value={size} onChange={(e) => setSize(e.target.value)} placeholder="ex: A3, M, 40" disabled={pending} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="matricula">Matrícula</Label>
          <Input id="matricula" value={matricula} onChange={(e) => setMatricula(e.target.value)} placeholder="nº da matrícula" disabled={pending} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cust">Nome do aluno</Label>
          <Input id="cust" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="quem pediu" disabled={pending} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="progress">Progresso do pedido</Label>
          <Input id="progress" value={progress} onChange={(e) => setProgress(e.target.value)} placeholder="ex: pedido ao fornecedor" disabled={pending} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="amount">Preço (R$)</Label>
          <Input id="amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="opcional" disabled={pending} />
        </div>
        <div className="space-y-1">
          <Label>Forma de pagamento</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod} disabled={pending}>
            <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>—</SelectItem>
              {PAY_METHODS.map((m) => (
                <SelectItem key={m} value={m}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Status do pagamento</Label>
          <Select value={paymentStatus} onValueChange={setPaymentStatus} disabled={pending}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TO_PAY">A pagar</SelectItem>
              <SelectItem value="PARTIAL">Parcial / sinal</SelectItem>
              <SelectItem value="PAID">Pago</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {editing ? null : (
          <div className="space-y-1">
            <Label htmlFor="date">Data da encomenda</Label>
            <Input id="date" type="date" value={orderedAt} onChange={(e) => setOrderedAt(e.target.value)} disabled={pending} />
          </div>
        )}
        <div className="space-y-1">
          <Label htmlFor="pickup">Retirada (data)</Label>
          <Input id="pickup" type="date" value={pickupAt} onChange={(e) => setPickupAt(e.target.value)} disabled={pending} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="notes">Observações</Label>
          <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="opcional" disabled={pending} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone} disabled={pending}>Cancelar</Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Salvando…" : editing ? "Salvar alterações" : "Registrar encomenda"}
        </Button>
      </div>
    </div>
  );
}

function OrderCard({ order: o }: { order: OrderRow }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  const setStatus = (status: "OPEN" | "FULFILLED" | "CANCELED") =>
    startTransition(async () => {
      const r = await updateOrderStatus({ id: o.id, status });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Atualizado");
      router.refresh();
    });

  const closed = o.status !== "OPEN";

  if (editing) {
    return (
      <li>
        <OrderForm order={o} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className={`rounded-lg border bg-card p-3 ${closed ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium">
            {o.quantity > 1 ? `${o.quantity}× ` : ""}{o.item}
            {o.size ? <span className="ml-1 text-xs text-muted-foreground">· {o.size}</span> : null}
          </div>
          <div className="text-xs text-muted-foreground">
            {o.customerName ? o.customerName : "sem aluno"}
            {o.matricula ? ` · mat. ${o.matricula}` : ""}
            {" · "}{ddmm(o.orderedAt)}
            {o.amount != null ? ` · ${brl(o.amount)}` : ""}
            {o.paymentMethod ? ` · ${o.paymentMethod}` : ""}
          </div>
          {o.progress ? (
            <div className="mt-1 text-xs"><span className="text-muted-foreground">progresso:</span> {o.progress}</div>
          ) : null}
          {o.pickupAt ? (
            <div className="text-xs"><span className="text-muted-foreground">retirada:</span> {ddmm(o.pickupAt)}</div>
          ) : null}
          {o.notes ? <div className="mt-1 text-xs italic text-muted-foreground">“{o.notes}”</div> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {o.status === "FULFILLED" ? (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">entregue</span>
          ) : o.status === "CANCELED" ? (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-900 dark:bg-red-900/40 dark:text-red-200">cancelada</span>
          ) : (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${PAY_TONE[o.paymentStatus]}`}>{PAY_LABEL[o.paymentStatus]}</span>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(true)} disabled={pending}>
          <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
        </Button>
        {!closed ? (
          <>
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

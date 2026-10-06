"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Gift, Pencil, RotateCcw, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
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
import { cn } from "@/lib/utils";

import { createOrder, setOrderStage, updateOrder, updateOrderStatus } from "./actions";
import type { OrderRow } from "@/server/orders";

type Stage = "REQUESTED" | "ORDERED" | "ARRIVED" | "DELIVERED" | "EXCHANGE";
type StageFilter = "ALL" | Stage | "CANCELED";

const STAGES: Array<{ key: Stage; label: string; tone: string }> = [
  { key: "REQUESTED", label: "Pedido feito", tone: "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200" },
  { key: "ORDERED", label: "Encomendado", tone: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200" },
  { key: "ARRIVED", label: "Chegou na unidade", tone: "bg-indigo-100 text-indigo-900 dark:bg-indigo-900/40 dark:text-indigo-200" },
  { key: "DELIVERED", label: "Entregue", tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200" },
  { key: "EXCHANGE", label: "Troca", tone: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" },
];
const STAGE_LABEL: Record<Stage, string> = Object.fromEntries(
  STAGES.map((s) => [s.key, s.label]),
) as Record<Stage, string>;
const STAGE_TONE: Record<Stage, string> = Object.fromEntries(
  STAGES.map((s) => [s.key, s.tone]),
) as Record<Stage, string>;

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
  const [filter, setFilter] = useState<StageFilter>("ALL");

  const active = orders.filter((o) => o.status !== "CANCELED");
  const canceledCount = orders.length - active.length;

  const byStage = useMemo(() => {
    const m = new Map<Stage, number>();
    for (const o of active) {
      const s = (o.stage as Stage) ?? "REQUESTED";
      m.set(s, (m.get(s) ?? 0) + 1);
    }
    return m;
  }, [active]);

  // v1.2-BX: financeiro das encomendas (não-brinde, não-canceladas).
  const previsto = active.reduce((s, o) => s + (o.isGift ? 0 : o.amount ?? 0), 0);
  const recebido = active.reduce(
    (s, o) => s + (!o.isGift && o.paymentStatus === "PAID" ? o.amount ?? 0 : 0),
    0,
  );

  const visible = orders.filter((o) => {
    if (filter === "ALL") return o.status !== "CANCELED";
    if (filter === "CANCELED") return o.status === "CANCELED";
    return o.status !== "CANCELED" && ((o.stage as Stage) ?? "REQUESTED") === filter;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">
          Previsto <b className="text-foreground">{brl(previsto)}</b> · Recebido{" "}
          <b className="text-emerald-700 dark:text-emerald-400">{brl(recebido)}</b>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Gift className="mr-1 h-4 w-4" />
          Nova encomenda
        </Button>
      </div>

      {creating ? <OrderForm onDone={() => setCreating(false)} /> : null}

      {/* v1.2-BX: cards clicáveis por etapa (Kanban) = filtro. */}
      <div className="flex flex-wrap gap-2">
        <FilterChip active={filter === "ALL"} onClick={() => setFilter("ALL")} label="Todas" count={active.length} />
        {STAGES.map((s) => (
          <FilterChip
            key={s.key}
            active={filter === s.key}
            onClick={() => setFilter(filter === s.key ? "ALL" : s.key)}
            label={s.label}
            count={byStage.get(s.key) ?? 0}
          />
        ))}
        {canceledCount > 0 ? (
          <FilterChip active={filter === "CANCELED"} onClick={() => setFilter(filter === "CANCELED" ? "ALL" : "CANCELED")} label="Canceladas" count={canceledCount} />
        ) : null}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma encomenda nesta etapa.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.map((o) => (
            <OrderCard key={o.id} order={o} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-muted/50",
        active && "ring-2 ring-primary",
      )}
    >
      <span className="font-medium">{label}</span>
      <span className="ml-1.5 rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">
        {count}
      </span>
    </button>
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
  const [isGift, setIsGift] = useState(order?.isGift ?? false);
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
        amount: isGift ? null : amount ? Number(amount.replace(",", ".")) : null,
        paymentMethod: isGift || paymentMethod === NONE ? null : paymentMethod,
        paymentStatus: isGift ? "PAID" : paymentStatus,
        pickupAt: pickupAt || null,
        notes: notes || null,
        isGift,
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
      <label className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-50/60 px-3 py-2 text-sm font-medium dark:bg-amber-500/5">
        <input type="checkbox" checked={isGift} onChange={(e) => setIsGift(e.target.checked)} disabled={pending} />
        <Gift className="h-3.5 w-3.5" /> Encomenda de brinde (kimono de matrícula — sem cobrança)
      </label>
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
        {isGift ? null : (
          <>
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
          </>
        )}
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

  const canceled = o.status === "CANCELED";
  const stage = (o.stage as Stage) ?? "REQUESTED";

  const changeStage = (next: Stage) =>
    startTransition(async () => {
      const r = await setOrderStage({ id: o.id, stage: next });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Etapa: ${STAGE_LABEL[next]}`);
      router.refresh();
    });

  const setStatus = (status: "OPEN" | "CANCELED") =>
    startTransition(async () => {
      const r = await updateOrderStatus({ id: o.id, status });
      if (!r.ok) return void toast.error(r.error);
      toast.success(status === "CANCELED" ? "Encomenda cancelada" : "Encomenda reaberta");
      router.refresh();
    });

  if (editing) {
    return (
      <li>
        <OrderForm order={o} onDone={() => setEditing(false)} />
      </li>
    );
  }

  return (
    <li className={`rounded-lg border bg-card p-3 ${canceled ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-medium">
            {o.quantity > 1 ? `${o.quantity}× ` : ""}{o.item}
            {o.size ? <span className="text-xs text-muted-foreground">· {o.size}</span> : null}
            {o.isGift ? (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                <Gift className="h-3 w-3" /> brinde
              </span>
            ) : null}
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
          {canceled ? (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-900 dark:bg-red-900/40 dark:text-red-200">cancelada</span>
          ) : (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STAGE_TONE[stage]}`}>{STAGE_LABEL[stage]}</span>
          )}
          {!o.isGift ? (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${PAY_TONE[o.paymentStatus]}`}>{PAY_LABEL[o.paymentStatus]}</span>
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(true)} disabled={pending}>
          <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
        </Button>
        {canceled ? (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setStatus("OPEN")} disabled={pending}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reabrir
          </Button>
        ) : (
          <>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-muted-foreground">Etapa:</span>
              <Select value={stage} onValueChange={(v) => changeStage(v as Stage)} disabled={pending}>
                <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STAGES.map((s) => (
                    <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => setStatus("CANCELED")} disabled={pending}>
              <X className="mr-1 h-3.5 w-3.5" /> Cancelar
            </Button>
          </>
        )}
      </div>
    </li>
  );
}

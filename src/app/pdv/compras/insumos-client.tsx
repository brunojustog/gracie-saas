"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Plus } from "lucide-react";
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

import { createSupplyExpense } from "./actions";
import type { SupplyExpenseRow } from "@/server/purchases";

const CATEGORIES = ["Limpeza", "Recepção/Escritório", "Manutenção", "Tatame/Equipamento", "Outro"];

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ddmm = (d: Date | string) => format(new Date(d), "dd/MM/yyyy", { locale: ptBR });

export function InsumosClient({ supplies }: { supplies: SupplyExpenseRow[] }) {
  const [creating, setCreating] = useState(false);
  const total = useMemo(() => supplies.reduce((s, x) => s + x.amount, 0), [supplies]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="rounded-lg border bg-card px-4 py-2">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">Gasto total em insumos</span>
          <div className="text-xl font-semibold">{brl(total)}</div>
        </div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" /> Lançar insumo
        </Button>
      </div>

      {creating ? <SupplyForm onDone={() => setCreating(false)} /> : null}

      {supplies.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma compra de insumo lançada ainda.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Item</th>
                <th className="px-3 py-2 text-left font-medium">Categoria</th>
                <th className="px-3 py-2 text-right font-medium">Qtd</th>
                <th className="px-3 py-2 text-right font-medium">Valor</th>
                <th className="px-3 py-2 text-right font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {supplies.map((s) => (
                <tr key={s.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium">{s.item}</div>
                    {s.supplier ? (
                      <div className="text-[11px] text-muted-foreground">forn.: {s.supplier}</div>
                    ) : null}
                    {s.notes ? (
                      <div className="text-[11px] italic text-muted-foreground">“{s.notes}”</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{s.category ?? "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.quantity ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{brl(s.amount)}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">{ddmm(s.purchasedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SupplyForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [item, setItem] = useState("");
  const [category, setCategory] = useState("Limpeza");
  const [quantity, setQuantity] = useState("");
  const [amount, setAmount] = useState("");
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(iso(new Date()));
  const [pending, startTransition] = useTransition();

  const save = () => {
    if (!item.trim()) return void toast.error("Descreva o item");
    const val = Number(amount.replace(",", "."));
    if (!Number.isFinite(val) || val < 0) return void toast.error("Valor inválido");
    startTransition(async () => {
      const r = await createSupplyExpense({
        item: item.trim(),
        category: category || null,
        quantity: quantity ? Number(quantity) : null,
        amount: val,
        supplier: supplier || null,
        notes: notes || null,
        purchasedAt,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Insumo lançado");
      router.refresh();
      onDone();
    });
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="s-item">Item *</Label>
          <Input id="s-item" value={item} onChange={(e) => setItem(e.target.value)} placeholder="ex: Detergente, papel toalha" autoFocus disabled={pending} />
        </div>
        <div className="space-y-1">
          <Label>Categoria</Label>
          <Select value={category} onValueChange={setCategory} disabled={pending}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="s-qty">Quantidade</Label>
          <Input id="s-qty" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="opcional" disabled={pending} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="s-amount">Valor pago (R$)</Label>
          <Input id="s-amount" value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="total" disabled={pending} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="s-supplier">Fornecedor</Label>
          <Input id="s-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="opcional" disabled={pending} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="s-date">Data da compra</Label>
          <Input id="s-date" type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} disabled={pending} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="s-notes">Observações</Label>
          <Textarea id="s-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="ex: nota nº" disabled={pending} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone} disabled={pending}>Cancelar</Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Salvando…" : "Lançar insumo"}
        </Button>
      </div>
    </div>
  );
}

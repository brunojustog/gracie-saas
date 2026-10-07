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

import { createPurchase } from "./actions";
import type { PurchaseRow } from "@/server/purchases";

type Variant = {
  variantId: string;
  productName: string;
  variantLabel: string;
  price: number;
  stock: number | null;
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ddmm = (d: Date | string) => format(new Date(d), "dd/MM/yyyy", { locale: ptBR });

export function ComprasClient({
  purchases,
  variants,
}: {
  purchases: PurchaseRow[];
  variants: Variant[];
}) {
  const [creating, setCreating] = useState(false);

  // Totais (gasto × margem potencial das compras listadas).
  const totals = useMemo(() => {
    let gasto = 0;
    let margem = 0;
    for (const p of purchases) {
      gasto += p.unitCost * p.quantity;
      if (p.unitSalePrice != null) margem += (p.unitSalePrice - p.unitCost) * p.quantity;
    }
    return { gasto, margem };
  }, [purchases]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Gasto total (compras)</div>
          <div className="mt-1 text-2xl font-semibold">{brl(totals.gasto)}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Margem potencial</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-400">{brl(totals.margem)}</div>
          <div className="text-[11px] text-muted-foreground">se vender tudo pelo preço de venda</div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreating((v) => !v)}>
          <Plus className="mr-1 h-4 w-4" /> Lançar compra
        </Button>
      </div>

      {creating ? (
        <PurchaseForm variants={variants} onDone={() => setCreating(false)} />
      ) : null}

      {purchases.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhuma compra lançada ainda.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Produto</th>
                <th className="px-3 py-2 text-right font-medium">Qtd</th>
                <th className="px-3 py-2 text-right font-medium">Custo un.</th>
                <th className="px-3 py-2 text-right font-medium">Venda un.</th>
                <th className="px-3 py-2 text-right font-medium">Total custo</th>
                <th className="px-3 py-2 text-right font-medium">Data</th>
              </tr>
            </thead>
            <tbody>
              {purchases.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium">{p.productName}</div>
                    {p.variantLabel ? (
                      <div className="text-[11px] text-muted-foreground">{p.variantLabel}</div>
                    ) : null}
                    {p.supplier ? (
                      <div className="text-[11px] text-muted-foreground">forn.: {p.supplier}</div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.quantity}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{brl(p.unitCost)}</td>
                  <td className="px-3 py-2 text-right font-mono text-xs text-muted-foreground">
                    {p.unitSalePrice != null ? brl(p.unitSalePrice) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-xs">{brl(p.unitCost * p.quantity)}</td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">{ddmm(p.purchasedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const CATEGORIES: Array<{ value: string; label: string }> = [
  { value: "KIMONO", label: "Kimonos" },
  { value: "FAIXA", label: "Faixas" },
  { value: "CAMISETA", label: "Camisetas" },
  { value: "RASHGUARD", label: "Rashguards" },
  { value: "BERMUDA_SHORT", label: "Bermudas/Shorts" },
  { value: "ACESSORIO", label: "Acessórios" },
  { value: "SUPLEMENTO", label: "Suplementos" },
  { value: "BEBIDA", label: "Bebidas" },
  { value: "ALIMENTOS", label: "Alimentos" },
  { value: "OUTRO", label: "Outro" },
];
const NEW_PRODUCT = "__new__";

function PurchaseForm({ variants, onDone }: { variants: Variant[]; onDone: () => void }) {
  const router = useRouter();
  const [variantId, setVariantId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [unitSalePrice, setUnitSalePrice] = useState("");
  const [updateSalePrice, setUpdateSalePrice] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [notes, setNotes] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(iso(new Date()));
  // v1.2-BY: cadastrar produto na própria compra.
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("OUTRO");
  const [newLabel, setNewLabel] = useState("");
  const [pending, startTransition] = useTransition();

  const isNew = variantId === NEW_PRODUCT;
  const selected = variants.find((v) => v.variantId === variantId) ?? null;

  // v1.2-BY: ao escolher um produto existente, puxa o preço de venda da lojinha.
  const pickVariant = (val: string) => {
    setVariantId(val);
    if (val !== NEW_PRODUCT) {
      const v = variants.find((x) => x.variantId === val);
      if (v) setUnitSalePrice(String(v.price));
    } else {
      setUnitSalePrice("");
    }
  };

  const save = () => {
    if (!variantId) return void toast.error("Escolha o produto");
    const qty = Number(quantity);
    const cost = Number(unitCost.replace(",", "."));
    if (!Number.isInteger(qty) || qty < 1) return void toast.error("Quantidade inválida");
    if (!Number.isFinite(cost) || cost < 0) return void toast.error("Custo inválido");
    if (isNew && !newName.trim()) return void toast.error("Dê um nome ao produto novo");
    const sale = unitSalePrice ? Number(unitSalePrice.replace(",", ".")) : null;
    startTransition(async () => {
      const r = await createPurchase({
        variantId: isNew ? null : variantId,
        newProduct: isNew
          ? { name: newName.trim(), category: newCategory, label: newLabel || null, salePrice: sale }
          : null,
        quantity: qty,
        unitCost: cost,
        unitSalePrice: sale,
        supplier: supplier || null,
        notes: notes || null,
        purchasedAt,
        updateSalePrice,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(isNew ? "Produto criado e compra lançada" : "Compra lançada · estoque atualizado");
      router.refresh();
      onDone();
    });
  };

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="space-y-1">
        <Label>Produto</Label>
        <Select value={variantId} onValueChange={pickVariant} disabled={pending}>
          <SelectTrigger><SelectValue placeholder="Escolha o produto…" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NEW_PRODUCT}>+ Cadastrar produto novo</SelectItem>
            {variants.map((v) => (
              <SelectItem key={v.variantId} value={v.variantId}>
                {v.productName} · {v.variantLabel}
                {v.stock != null ? ` (estoque ${v.stock})` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selected ? (
          <p className="text-[11px] text-muted-foreground">
            Preço de venda atual: {brl(selected.price)}
            {selected.stock != null ? ` · estoque ${selected.stock}` : " · estoque ilimitado"}
          </p>
        ) : null}
      </div>

      {isNew ? (
        <div className="grid gap-3 rounded-lg border border-dashed p-3 sm:grid-cols-3">
          <div className="space-y-1 sm:col-span-1">
            <Label htmlFor="np-name">Nome do produto</Label>
            <Input id="np-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ex: Kimono azul" disabled={pending} />
          </div>
          <div className="space-y-1">
            <Label>Categoria</Label>
            <Select value={newCategory} onValueChange={setNewCategory} disabled={pending}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="np-label">Variação/tamanho</Label>
            <Input id="np-label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="ex: A3 (ou vazio = Padrão)" disabled={pending} />
          </div>
        </div>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="qty">Quantidade</Label>
          <Input id="qty" value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" placeholder="ex: 20" disabled={pending} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cost">Custo unitário (R$)</Label>
          <Input id="cost" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} inputMode="decimal" placeholder="quanto pagou por un." disabled={pending} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sale">Preço de venda (R$)</Label>
          <Input id="sale" value={unitSalePrice} onChange={(e) => setUnitSalePrice(e.target.value)} inputMode="decimal" placeholder="opcional" disabled={pending} />
        </div>
      </div>
      {unitSalePrice ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={updateSalePrice} onChange={(e) => setUpdateSalePrice(e.target.checked)} disabled={pending} />
          Atualizar o preço de venda do produto com este valor
        </label>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="supplier">Fornecedor</Label>
          <Input id="supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="opcional" disabled={pending} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="date">Data da compra</Label>
          <Input id="date" type="date" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} disabled={pending} />
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="notes">Observações</Label>
        <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="ex: nota nº, desconto por volume" disabled={pending} />
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={onDone} disabled={pending}>Cancelar</Button>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Salvando…" : "Lançar compra"}
        </Button>
      </div>
    </div>
  );
}

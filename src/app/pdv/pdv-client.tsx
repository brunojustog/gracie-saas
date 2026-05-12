"use client";

import type { ProductCategory, SalePaymentMethod } from "@prisma/client";
import { Minus, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
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

import { createSale } from "./actions";
import type { ProductListItem } from "@/server/pdv";

type Lead = { id: string; name: string };

type CartLine = {
  variantId: string;
  productId: string;
  productName: string;
  variantLabel: string;
  unitPrice: number;
  stock: number | null;
  quantity: number;
};

const NO_CUSTOMER = "__avulsa__";

const CATEGORY_LABEL: Record<ProductCategory, string> = {
  BEBIDA: "Bebidas",
  SUPLEMENTO: "Suplementos",
  KIMONO: "Kimonos",
  FAIXA: "Faixas",
  CAMISETA: "Camisetas",
  RASHGUARD: "Rashguards",
  BERMUDA_SHORT: "Bermudas",
  ACESSORIO: "Acessórios",
  OUTRO: "Outros",
};

const PAYMENT_METHODS: Array<{ value: SalePaymentMethod; label: string }> = [
  { value: "PIX", label: "Pix" },
  { value: "DINHEIRO", label: "Dinheiro" },
  { value: "CARTAO_DEBITO", label: "Cartão débito" },
  { value: "CARTAO_CREDITO", label: "Cartão crédito" },
  { value: "CORTESIA", label: "Cortesia" },
  { value: "OUTRO", label: "Outro" },
];

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PdvClient({
  products,
  leads,
}: {
  products: ProductListItem[];
  leads: Lead[];
}) {
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ProductCategory | "all">("all");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] =
    useState<SalePaymentMethod>("PIX");
  const [customerLeadId, setCustomerLeadId] = useState<string>(NO_CUSTOMER);
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => (category === "all" ? true : p.category === category))
      .filter((p) =>
        q ? p.name.toLowerCase().includes(q) : true,
      );
  }, [products, search, category]);

  const total = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

  const addVariant = (product: ProductListItem, variantId: string) => {
    const v = product.variants.find((x) => x.id === variantId);
    if (!v) return;
    if (v.price <= 0) {
      toast.error("Produto sem preço cadastrado");
      return;
    }
    if (v.stock !== null && v.stock <= 0) {
      toast.error("Sem estoque");
      return;
    }

    setCart((prev) => {
      const existing = prev.find((l) => l.variantId === variantId);
      if (existing) {
        if (v.stock !== null && existing.quantity + 1 > v.stock) {
          toast.error(`Estoque máximo: ${v.stock}`);
          return prev;
        }
        return prev.map((l) =>
          l.variantId === variantId ? { ...l, quantity: l.quantity + 1 } : l,
        );
      }
      return [
        ...prev,
        {
          variantId: v.id,
          productId: product.id,
          productName: product.name,
          variantLabel: v.label,
          unitPrice: v.price,
          stock: v.stock,
          quantity: 1,
        },
      ];
    });
  };

  const changeQuantity = (variantId: string, delta: number) => {
    setCart((prev) =>
      prev.flatMap((l) => {
        if (l.variantId !== variantId) return [l];
        const next = l.quantity + delta;
        if (next <= 0) return [];
        if (l.stock !== null && next > l.stock) {
          toast.error(`Estoque máximo: ${l.stock}`);
          return [l];
        }
        return [{ ...l, quantity: next }];
      }),
    );
  };

  const removeLine = (variantId: string) => {
    setCart((prev) => prev.filter((l) => l.variantId !== variantId));
  };

  const handleSubmit = () => {
    if (cart.length === 0) {
      toast.error("Carrinho vazio");
      return;
    }
    startTransition(async () => {
      const result = await createSale({
        items: cart.map((l) => ({
          productVariantId: l.variantId,
          quantity: l.quantity,
        })),
        paymentMethod,
        customerLeadId:
          customerLeadId === NO_CUSTOMER ? null : customerLeadId,
        notes: notes || undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Venda registrada · ${fmtBRL(total)}`);
      setCart([]);
      setNotes("");
      setCustomerLeadId(NO_CUSTOMER);
      setPaymentMethod("PIX");
    });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_400px]">
      {/* Catálogo */}
      <section className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar produto…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select
            value={category}
            onValueChange={(v) => setCategory(v as ProductCategory | "all")}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            Nenhum produto encontrado.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={addVariant} />
            ))}
          </div>
        )}
      </section>

      {/* Carrinho */}
      <aside className="space-y-3 rounded-lg border bg-card p-4 lg:sticky lg:top-4 lg:self-start">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Carrinho ({cart.length})
        </h2>

        {cart.length === 0 ? (
          <p className="rounded border border-dashed p-6 text-center text-sm text-muted-foreground">
            Clique nos produtos pra adicionar.
          </p>
        ) : (
          <ul className="space-y-2">
            {cart.map((l) => (
              <li
                key={l.variantId}
                className="rounded border bg-background p-2 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{l.productName}</div>
                    <div className="text-xs text-muted-foreground">
                      {l.variantLabel} · {fmtBRL(l.unitPrice)}
                    </div>
                  </div>
                  <button
                    onClick={() => removeLine(l.variantId)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Remover"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => changeQuantity(l.variantId, -1)}
                      aria-label="Diminuir"
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="w-6 text-center text-sm font-medium">
                      {l.quantity}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => changeQuantity(l.variantId, 1)}
                      aria-label="Aumentar"
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  <span className="text-sm font-semibold">
                    {fmtBRL(l.unitPrice * l.quantity)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-2 border-t pt-3">
          <div className="space-y-1">
            <Label htmlFor="payment">Pagamento</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as SalePaymentMethod)}
            >
              <SelectTrigger id="payment" className="h-9">
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

          <div className="space-y-1">
            <Label htmlFor="customer">Aluno (opcional)</Label>
            <Select value={customerLeadId} onValueChange={setCustomerLeadId}>
              <SelectTrigger id="customer" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CUSTOMER}>Venda avulsa</SelectItem>
                {leads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="notes">Observações</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="opcional"
            />
          </div>
        </div>

        <div className="flex items-center justify-between border-t pt-3 text-base">
          <span className="font-semibold">Total</span>
          <span className="text-lg font-bold">{fmtBRL(total)}</span>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={cart.length === 0 || pending}
          className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {pending ? "Registrando…" : "Fechar venda"}
        </Button>
      </aside>
    </div>
  );
}

function ProductCard({
  product,
  onAdd,
}: {
  product: ProductListItem;
  onAdd: (product: ProductListItem, variantId: string) => void;
}) {
  // Se tem 1 variant só, clique direto adiciona. Senão, mostra seletor.
  const single = product.variants.length === 1 ? product.variants[0] : null;
  const minPrice = Math.min(...product.variants.map((v) => v.price));
  const totalStock = product.variants.reduce<number | null>((acc, v) => {
    if (acc === null || v.stock === null) return null;
    return acc + v.stock;
  }, 0);

  if (single) {
    const low = single.stock !== null && single.stock < 5;
    const out = single.stock !== null && single.stock <= 0;
    return (
      <button
        type="button"
        onClick={() => onAdd(product, single.id)}
        disabled={out || single.price <= 0}
        className="flex flex-col items-start gap-1 rounded-md border bg-card p-3 text-left transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
      >
        <div className="line-clamp-2 text-sm font-medium">{product.name}</div>
        <div className="flex w-full items-center justify-between text-xs">
          <span className="text-muted-foreground">
            {single.price > 0 ? fmtBRL(single.price) : "sem preço"}
          </span>
          {single.stock !== null ? (
            <span
              className={
                out
                  ? "font-semibold text-destructive"
                  : low
                    ? "font-semibold text-amber-600"
                    : "text-muted-foreground"
              }
            >
              {out ? "esgotado" : low ? `${single.stock} restam` : `est: ${single.stock}`}
            </span>
          ) : null}
        </div>
      </button>
    );
  }

  return (
    <div className="rounded-md border bg-card p-3">
      <div className="line-clamp-2 text-sm font-medium">{product.name}</div>
      <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
        <span>a partir de {fmtBRL(minPrice)}</span>
        {totalStock !== null ? <span>est: {totalStock}</span> : null}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        {product.variants.map((v) => {
          const out = v.stock !== null && v.stock <= 0;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onAdd(product, v.id)}
              disabled={out || v.price <= 0}
              className="rounded border bg-background px-2 py-0.5 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
              title={
                v.price <= 0
                  ? "sem preço"
                  : out
                    ? "esgotado"
                    : `${fmtBRL(v.price)}${v.stock !== null ? ` · est ${v.stock}` : ""}`
              }
            >
              {v.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

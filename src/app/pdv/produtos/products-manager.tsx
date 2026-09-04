"use client";

import type { ProductCategory } from "@prisma/client";
import { Pencil, Plus, Trash2, Upload } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";

import {
  deleteVariant,
  importProducts,
  upsertProduct,
  upsertVariant,
} from "../actions";
import type { ProductListItem } from "@/server/pdv";

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

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Variant = ProductListItem["variants"][number];

export function ProductsManager({ products }: { products: ProductListItem[] }) {
  const [productModal, setProductModal] = useState<{
    open: boolean;
    product?: ProductListItem;
  }>({ open: false });

  const [variantModal, setVariantModal] = useState<{
    open: boolean;
    productId: string;
    variant?: Variant;
  } | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end gap-2">
        <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
          <Upload className="mr-1 h-4 w-4" /> Importar CSV
        </Button>
        <Button
          size="sm"
          onClick={() => setProductModal({ open: true })}
        >
          <Plus className="mr-1 h-4 w-4" /> Novo produto
        </Button>
      </div>

      {products.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhum produto cadastrado.
        </div>
      ) : (
        <div className="space-y-2">
          {products.map((p) => (
            <ProductRow
              key={p.id}
              product={p}
              onEditProduct={() =>
                setProductModal({ open: true, product: p })
              }
              onAddVariant={() =>
                setVariantModal({ open: true, productId: p.id })
              }
              onEditVariant={(v) =>
                setVariantModal({ open: true, productId: p.id, variant: v })
              }
            />
          ))}
        </div>
      )}

      {productModal.open ? (
        <ProductModal
          product={productModal.product}
          onClose={() => setProductModal({ open: false })}
        />
      ) : null}

      {variantModal?.open ? (
        <VariantModal
          productId={variantModal.productId}
          variant={variantModal.variant}
          onClose={() => setVariantModal(null)}
        />
      ) : null}

      {importOpen ? <ImportModal onClose={() => setImportOpen(false)} /> : null}
    </div>
  );
}

// ── CSV: parser simples que respeita aspas ────────────────────────────────
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((x) => x.trim() !== "")) rows.push(row); }
  return rows;
}

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .split("")
    .filter((ch) => {
      const c = ch.codePointAt(0) ?? 0;
      return c < 0x0300 || c > 0x036f; // remove acentos combinantes
    })
    .join("");

const parsePriceBR = (s: string): number => {
  const t = s.trim().replace(/\./g, "").replace(",", ".");
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : 0;
};

type ImportRow = { name: string; category?: string; price: number; sku?: string; stock?: number | null };

function ImportModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [pending, startTransition] = useTransition();

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileName(file.name);
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length < 2) {
      toast.error("CSV vazio ou sem linhas");
      return;
    }
    const header = parsed[0].map(norm);
    const idx = (names: string[]) => header.findIndex((h) => names.includes(h));
    const iName = idx(["nome", "descricao", "produto"]);
    const iCat = idx(["categoria", "categoria "]);
    const iPrice = idx(["preco", "valor", "preco de venda"]);
    const iSku = idx(["sku", "codigo", "cod"]);
    const iStock = idx(["estoque", "saldo", "quantidade"]);
    if (iName < 0 || iPrice < 0) {
      toast.error("O CSV precisa ter ao menos as colunas 'nome' e 'preco'");
      return;
    }
    const out: ImportRow[] = [];
    for (let i = 1; i < parsed.length; i++) {
      const r = parsed[i];
      const name = (r[iName] ?? "").trim();
      if (!name) continue;
      const stockRaw = iStock >= 0 ? (r[iStock] ?? "").trim() : "";
      const stockNum = stockRaw ? Math.max(0, Math.trunc(Number(stockRaw.replace(",", ".")))) : null;
      out.push({
        name,
        category: iCat >= 0 ? (r[iCat] ?? "").trim().toUpperCase() : undefined,
        price: parsePriceBR(r[iPrice] ?? "0"),
        sku: iSku >= 0 ? (r[iSku] ?? "").trim() || undefined : undefined,
        stock: Number.isFinite(stockNum as number) ? stockNum : null,
      });
    }
    setRows(out);
  };

  const doImport = () => {
    if (rows.length === 0) return void toast.error("Selecione um CSV primeiro");
    startTransition(async () => {
      const r = await importProducts({ rows });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Importados: ${r.created} · já existiam: ${r.skipped}`);
      router.refresh();
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar produtos (CSV)</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Colunas aceitas: <b>nome</b>, <b>preco</b> (obrigatórias) e
            opcionais <b>categoria</b>, <b>sku</b>, <b>estoque</b>. Cada linha
            vira um produto (variante “Padrão”). Produtos com nome já existente
            são ignorados.
          </p>
          <Input type="file" accept=".csv,text/csv" onChange={onFile} disabled={pending} />
          {fileName ? (
            <div className="rounded border bg-muted/40 p-2 text-xs">
              <div className="font-medium">{fileName}</div>
              <div className="text-muted-foreground">
                {rows.length} produto{rows.length === 1 ? "" : "s"} detectado{rows.length === 1 ? "" : "s"}
              </div>
              {rows.slice(0, 4).map((r, i) => (
                <div key={i} className="mt-0.5 truncate text-muted-foreground">
                  • {r.name} — {fmtBRL(r.price)}
                </div>
              ))}
              {rows.length > 4 ? <div className="text-muted-foreground">…</div> : null}
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>Cancelar</Button>
          <Button onClick={doImport} disabled={pending || rows.length === 0}>
            {pending ? "Importando…" : `Importar ${rows.length || ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductRow({
  product,
  onEditProduct,
  onAddVariant,
  onEditVariant,
}: {
  product: ProductListItem;
  onEditProduct: () => void;
  onAddVariant: () => void;
  onEditVariant: (v: Variant) => void;
}) {
  const totalStock = product.variants.reduce<number | null>((acc, v) => {
    if (acc === null || v.stock === null) return null;
    return acc + v.stock;
  }, 0);

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-3 border-b p-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{product.name}</span>
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase">
              {CATEGORY_LABEL[product.category]}
            </span>
            {!product.active ? (
              <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] uppercase text-amber-800">
                inativo
              </span>
            ) : null}
          </div>
          {product.description ? (
            <div className="text-xs text-muted-foreground">
              {product.description}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="text-muted-foreground">
            {product.variants.length} variante
            {product.variants.length === 1 ? "" : "s"}
            {totalStock !== null ? ` · est total ${totalStock}` : ""}
          </span>
          <Button variant="ghost" size="sm" onClick={onEditProduct}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="outline" size="sm" onClick={onAddVariant}>
            <Plus className="mr-1 h-3 w-3" /> Variante
          </Button>
        </div>
      </div>

      {product.variants.length === 0 ? (
        <div className="p-3 text-xs italic text-muted-foreground">
          Sem variantes — adicione pelo menos uma pra poder vender.
        </div>
      ) : (
        <ul className="divide-y">
          {product.variants.map((v) => {
            const noPrice = v.price <= 0;
            const out = v.stock !== null && v.stock <= 0;
            const low = v.stock !== null && v.stock > 0 && v.stock < 5;
            return (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 p-2 px-3 text-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium">{v.label}</span>
                  {v.sku ? (
                    <span className="text-xs text-muted-foreground">
                      SKU {v.sku}
                    </span>
                  ) : null}
                  {!v.active ? (
                    <span className="rounded bg-muted px-1 py-0.5 text-[10px]">
                      inativa
                    </span>
                  ) : null}
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span
                    className={
                      noPrice
                        ? "font-semibold text-destructive"
                        : "text-muted-foreground"
                    }
                  >
                    {noPrice ? "sem preço" : fmtBRL(v.price)}
                  </span>
                  <span
                    className={
                      out
                        ? "font-semibold text-destructive"
                        : low
                          ? "font-semibold text-amber-600"
                          : "text-muted-foreground"
                    }
                  >
                    {v.stock === null
                      ? "estoque livre"
                      : out
                        ? "esgotado"
                        : `est ${v.stock}`}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditVariant(v)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ProductModal({
  product,
  onClose,
}: {
  product?: ProductListItem;
  onClose: () => void;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [category, setCategory] = useState<ProductCategory>(
    product?.category ?? "OUTRO",
  );
  const [description, setDescription] = useState(product?.description ?? "");
  const [active, setActive] = useState(product?.active ?? true);
  const [pending, startTransition] = useTransition();

  const handleSubmit = () => {
    startTransition(async () => {
      const result = await upsertProduct({
        id: product?.id,
        name,
        category,
        description: description || undefined,
        active,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(product ? "Produto atualizado" : "Produto criado");
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {product ? "Editar produto" : "Novo produto"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="name">Nome</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="cat">Categoria</Label>
            <Select
              value={category}
              onValueChange={(v) => setCategory(v as ProductCategory)}
              disabled={pending}
            >
              <SelectTrigger id="cat">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(CATEGORY_LABEL).map(([k, v]) => (
                  <SelectItem key={k} value={k}>
                    {v}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="desc">Descrição</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              disabled={pending}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Produto ativo
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!name || pending}>
            {pending ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VariantModal({
  productId,
  variant,
  onClose,
}: {
  productId: string;
  variant?: Variant;
  onClose: () => void;
}) {
  const [label, setLabel] = useState(variant?.label ?? "");
  const [sku, setSku] = useState(variant?.sku ?? "");
  const [price, setPrice] = useState(String(variant?.price ?? ""));
  const [controlStock, setControlStock] = useState(
    variant ? variant.stock !== null : false,
  );
  const [stock, setStock] = useState(String(variant?.stock ?? "0"));
  const [active, setActive] = useState(variant?.active ?? true);
  const [pending, startTransition] = useTransition();

  const handleSubmit = () => {
    const priceNum = Number(price.replace(",", "."));
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      toast.error("Preço inválido");
      return;
    }
    let stockNum: number | null = null;
    if (controlStock) {
      stockNum = Number(stock);
      if (!Number.isInteger(stockNum) || stockNum < 0) {
        toast.error("Estoque inválido");
        return;
      }
    }
    startTransition(async () => {
      const result = await upsertVariant({
        id: variant?.id,
        productId,
        label,
        sku: sku || null,
        price: priceNum,
        stock: stockNum,
        active,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(variant ? "Variante atualizada" : "Variante criada");
      onClose();
    });
  };

  const handleDelete = () => {
    if (!variant) return;
    if (!confirm(`Excluir variante "${variant.label}"?`)) return;
    startTransition(async () => {
      const result = await deleteVariant({ variantId: variant.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Variante excluída");
      onClose();
    });
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {variant ? "Editar variante" : "Nova variante"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="label">Rótulo</Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                disabled={pending}
                placeholder="ex: A2, M, Padrão"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sku">SKU</Label>
              <Input
                id="sku"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                disabled={pending}
                placeholder="opcional"
              />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="price">Preço (R$)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              disabled={pending}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={controlStock}
              onChange={(e) => setControlStock(e.target.checked)}
            />
            Controlar estoque
          </label>

          {controlStock ? (
            <div className="space-y-1">
              <Label htmlFor="stock">Estoque atual</Label>
              <Input
                id="stock"
                type="number"
                step="1"
                min="0"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                disabled={pending}
              />
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Sem controle de estoque — sempre disponível pra venda.
            </p>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            Variante ativa
          </label>
        </div>
        <DialogFooter className="sm:justify-between">
          {variant ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              disabled={pending}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Excluir
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!label || !price || pending}
            >
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";
import type { PurchaseRow, SupplyExpenseRow } from "@/server/purchases";

import { ComprasClient } from "./compras-client";
import { InsumosClient } from "./insumos-client";

type Variant = {
  variantId: string;
  productName: string;
  variantLabel: string;
  price: number;
  stock: number | null;
};

type Tab = "lojinha" | "insumos";

export function ComprasTabs({
  purchases,
  variants,
  supplies,
}: {
  purchases: PurchaseRow[];
  variants: Variant[];
  supplies: SupplyExpenseRow[];
}) {
  const [tab, setTab] = useState<Tab>("lojinha");

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
        <TabButton active={tab === "lojinha"} onClick={() => setTab("lojinha")}>
          Lojinha (estoque/venda)
        </TabButton>
        <TabButton active={tab === "insumos"} onClick={() => setTab("insumos")}>
          Insumos da academia
        </TabButton>
      </div>

      {tab === "lojinha" ? (
        <ComprasClient purchases={purchases} variants={variants} />
      ) : (
        <InsumosClient supplies={supplies} />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

"use client";

import type { SalePaymentMethod } from "@prisma/client";
import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

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

type Seller = { id: string; name: string | null; email: string };

const ALL = "__all__";

export function HistoricoToolbar({
  sellers,
  initial,
  canFilterSeller,
}: {
  sellers: Seller[];
  initial: {
    from?: string;
    to?: string;
    seller?: string;
    payment?: SalePaymentMethod;
  };
  canFilterSeller: boolean;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();

  const updateParam = (key: string, value: string) => {
    const params = new URLSearchParams(sp.toString());
    if (!value || value === ALL) {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    startTransition(() => {
      router.replace(`?${params.toString()}`);
    });
  };

  const clearAll = () => {
    startTransition(() => {
      router.replace("?");
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card p-3">
      <div className="space-y-1">
        <Label htmlFor="from" className="text-xs">
          De
        </Label>
        <Input
          id="from"
          type="date"
          defaultValue={initial.from ?? ""}
          onChange={(e) => updateParam("from", e.target.value)}
          disabled={pending}
          className="h-9 w-[160px]"
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="to" className="text-xs">
          Até
        </Label>
        <Input
          id="to"
          type="date"
          defaultValue={initial.to ?? ""}
          onChange={(e) => updateParam("to", e.target.value)}
          disabled={pending}
          className="h-9 w-[160px]"
        />
      </div>

      {canFilterSeller ? (
        <div className="space-y-1">
          <Label className="text-xs">Vendedora</Label>
          <Select
            value={initial.seller ?? ALL}
            onValueChange={(v) => updateParam("seller", v)}
            disabled={pending}
          >
            <SelectTrigger className="h-9 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Todas</SelectItem>
              {sellers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name ?? s.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="space-y-1">
        <Label className="text-xs">Pagamento</Label>
        <Select
          value={initial.payment ?? ALL}
          onValueChange={(v) => updateParam("payment", v)}
          disabled={pending}
        >
          <SelectTrigger className="h-9 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos</SelectItem>
            <SelectItem value="PIX">Pix</SelectItem>
            <SelectItem value="DINHEIRO">Dinheiro</SelectItem>
            <SelectItem value="CARTAO_DEBITO">Débito</SelectItem>
            <SelectItem value="CARTAO_CREDITO">Crédito</SelectItem>
            <SelectItem value="CORTESIA">Cortesia</SelectItem>
            <SelectItem value="OUTRO">Outro</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={clearAll}
        disabled={pending}
      >
        Limpar
      </Button>
    </div>
  );
}

"use client";

import { Calendar } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { PeriodPreset } from "@/lib/period";

const OPTIONS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "this_month", label: "Mês atual" },
  { value: "last_month", label: "Mês anterior" },
  { value: "last_7_days", label: "7 dias" },
  { value: "last_30_days", label: "30 dias" },
];

function iso(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Filtro de período da segmentação de experimentais no Quadro (v1.1-BE).
 * Default = mês atual (sem ?period na URL). Usa os params period/from/to,
 * lidos só pela seção de experimentais.
 */
export function ExpPeriodFilter({
  current,
  from,
  to,
}: {
  current: PeriodPreset | "custom";
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [showCustom, setShowCustom] = useState(current === "custom");
  const today = new Date();
  const [fromInput, setFromInput] = useState(
    from ?? iso(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [toInput, setToInput] = useState(to ?? iso(today));

  const setPreset = (value: PeriodPreset) => {
    const next = new URLSearchParams(params.toString());
    next.delete("from");
    next.delete("to");
    // mês atual é o default — sem ?period na URL.
    if (value === "this_month") next.delete("period");
    else next.set("period", value);
    setShowCustom(false);
    startTransition(() => router.replace(`/quadro?${next.toString()}`));
  };

  const applyCustom = () => {
    if (!fromInput || !toInput) return;
    const next = new URLSearchParams(params.toString());
    next.delete("period");
    next.set("from", fromInput);
    next.set("to", toInput);
    startTransition(() => router.replace(`/quadro?${next.toString()}`));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
        {OPTIONS.map((o) => (
          <Button
            key={o.value}
            size="sm"
            variant={current === o.value ? "default" : "ghost"}
            onClick={() => setPreset(o.value)}
            className={cn("h-8 px-3 text-xs", current !== o.value && "text-muted-foreground")}
          >
            {o.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant={current === "custom" ? "default" : "ghost"}
          onClick={() => setShowCustom((v) => !v)}
          className={cn("h-8 px-3 text-xs", current !== "custom" && "text-muted-foreground")}
        >
          <Calendar className="mr-1 h-3.5 w-3.5" />
          Personalizado
        </Button>
      </div>

      {showCustom ? (
        <div className="flex items-end gap-2 rounded-lg border bg-card p-2">
          <div>
            <Label htmlFor="exp-from" className="text-[10px] uppercase">
              De
            </Label>
            <Input
              id="exp-from"
              type="date"
              value={fromInput}
              max={toInput}
              onChange={(e) => setFromInput(e.target.value)}
              className="h-8 w-36 text-xs"
            />
          </div>
          <div>
            <Label htmlFor="exp-to" className="text-[10px] uppercase">
              Até
            </Label>
            <Input
              id="exp-to"
              type="date"
              value={toInput}
              min={fromInput}
              onChange={(e) => setToInput(e.target.value)}
              className="h-8 w-36 text-xs"
            />
          </div>
          <Button size="sm" onClick={applyCustom} className="h-8 text-xs">
            Aplicar
          </Button>
        </div>
      ) : null}
    </div>
  );
}

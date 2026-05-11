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

function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function thirtyDaysAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type Props = {
  current: PeriodPreset | "custom";
  /** Apenas presente quando current="custom". */
  from?: string;
  to?: string;
};

export function PeriodFilter({ current, from, to }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();
  const [showCustom, setShowCustom] = useState(current === "custom");
  const [fromInput, setFromInput] = useState(from ?? thirtyDaysAgoIso());
  const [toInput, setToInput] = useState(to ?? todayIso());

  const setPreset = (value: PeriodPreset) => {
    const next = new URLSearchParams(params.toString());
    next.delete("from");
    next.delete("to");
    if (value === "this_month") next.delete("period");
    else next.set("period", value);
    setShowCustom(false);
    startTransition(() => {
      router.replace(`/dashboard?${next.toString()}`);
    });
  };

  const applyCustom = () => {
    if (!fromInput || !toInput) return;
    const next = new URLSearchParams(params.toString());
    next.delete("period");
    next.set("from", fromInput);
    next.set("to", toInput);
    startTransition(() => {
      router.replace(`/dashboard?${next.toString()}`);
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap gap-1 rounded-lg border bg-card p-1">
        {OPTIONS.map((o) => (
          <Button
            key={o.value}
            size="sm"
            variant={current === o.value ? "default" : "ghost"}
            onClick={() => setPreset(o.value)}
            className={cn(
              "h-8 px-3 text-xs",
              current !== o.value && "text-muted-foreground",
            )}
          >
            {o.label}
          </Button>
        ))}
        <Button
          size="sm"
          variant={current === "custom" ? "default" : "ghost"}
          onClick={() => setShowCustom((v) => !v)}
          className={cn(
            "h-8 px-3 text-xs",
            current !== "custom" && "text-muted-foreground",
          )}
        >
          <Calendar className="mr-1 h-3.5 w-3.5" />
          Personalizado
        </Button>
      </div>

      {showCustom ? (
        <div className="flex items-end gap-2 rounded-lg border bg-card p-2">
          <div>
            <Label htmlFor="from-date" className="text-[10px] uppercase">
              De
            </Label>
            <Input
              id="from-date"
              type="date"
              value={fromInput}
              max={toInput}
              onChange={(e) => setFromInput(e.target.value)}
              className="h-8 w-36 text-xs"
            />
          </div>
          <div>
            <Label htmlFor="to-date" className="text-[10px] uppercase">
              Até
            </Label>
            <Input
              id="to-date"
              type="date"
              value={toInput}
              min={fromInput}
              max={todayIso()}
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

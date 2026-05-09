"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PeriodPreset } from "@/lib/period";

const OPTIONS: Array<{ value: PeriodPreset; label: string }> = [
  { value: "this_month", label: "Mês atual" },
  { value: "last_month", label: "Mês anterior" },
  { value: "last_7_days", label: "7 dias" },
  { value: "last_30_days", label: "30 dias" },
];

export function PeriodFilter({ current }: { current: PeriodPreset }) {
  const router = useRouter();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  const setPreset = (value: PeriodPreset) => {
    const next = new URLSearchParams(params.toString());
    if (value === "this_month") next.delete("period");
    else next.set("period", value);
    startTransition(() => {
      router.replace(`/dashboard?${next.toString()}`);
    });
  };

  return (
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
    </div>
  );
}

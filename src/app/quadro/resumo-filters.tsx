"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * v1.1-CG: filtro de datas do "Resumo por período" (params rfrom/rto,
 * independentes do filtro de experimentais). Mantém os demais params.
 */
export function RangeResumoFilter({
  from,
  to,
}: {
  from?: string;
  to?: string;
}) {
  const router = useRouter();
  const sp = useSearchParams();
  const [f, setF] = useState(from ?? "");
  const [t, setT] = useState(to ?? "");

  const apply = () => {
    if (!f || !t) return;
    const p = new URLSearchParams(sp.toString());
    p.set("rfrom", f);
    p.set("rto", t);
    router.push(`/quadro?${p.toString()}`);
  };

  const clear = () => {
    const p = new URLSearchParams(sp.toString());
    p.delete("rfrom");
    p.delete("rto");
    setF("");
    setT("");
    router.push(`/quadro?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="space-y-0.5">
        <span className="text-[11px] text-muted-foreground">De</span>
        <Input type="date" value={f} onChange={(e) => setF(e.target.value)} className="h-9 w-auto" />
      </div>
      <div className="space-y-0.5">
        <span className="text-[11px] text-muted-foreground">Até</span>
        <Input type="date" value={t} onChange={(e) => setT(e.target.value)} className="h-9 w-auto" />
      </div>
      <Button size="sm" onClick={apply} disabled={!f || !t} className="h-9">
        Ver resumo
      </Button>
      {from || to ? (
        <Button size="sm" variant="ghost" onClick={clear} className="h-9">
          Limpar
        </Button>
      ) : null}
    </div>
  );
}

/** v1.1-CG: nº de dias da faixa "Resumo dos últimos dias" (7/14/30). */
export function DailyDaysFilter({ current }: { current: number }) {
  const router = useRouter();
  const sp = useSearchParams();

  const set = (n: number) => {
    const p = new URLSearchParams(sp.toString());
    if (n === 7) p.delete("days");
    else p.set("days", String(n));
    router.push(`/quadro?${p.toString()}`);
  };

  return (
    <div className="inline-flex overflow-hidden rounded-md border text-xs">
      {[7, 14, 30].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => set(n)}
          className={`px-2.5 py-1 ${
            current === n ? "bg-primary text-primary-foreground" : "hover:bg-accent"
          }`}
        >
          {n} dias
        </button>
      ))}
    </div>
  );
}

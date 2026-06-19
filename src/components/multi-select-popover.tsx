"use client";

import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export type MultiOption = { value: string; label: string };

/**
 * Filtro multi-seleção (v1.1-AV) — checkboxes num popover. Reutilizado em
 * Matrículas (modalidade, pagamento, status) e onde mais houver filtro com
 * +2 opções. Controlado: `selected` é a lista de valores marcados.
 */
export function MultiSelectPopover({
  options,
  selected,
  onChange,
  allLabel,
  width = "w-48",
}: {
  options: MultiOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  allLabel: string;
  width?: string;
}) {
  const toggle = (value: string) => {
    const set = new Set(selected);
    if (set.has(value)) set.delete(value);
    else set.add(value);
    onChange([...set]);
  };

  const label =
    selected.length === 0
      ? allLabel
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? `${selected.length}`)
        : `${selected.length} selecionados`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={`h-9 ${width} justify-between font-normal`}>
          <span className="truncate">{label}</span>
          <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-2">
        <div className="max-h-64 space-y-0.5 overflow-y-auto">
          {options.map((o) => (
            <label
              key={o.value}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
            >
              <input
                type="checkbox"
                checked={selected.includes(o.value)}
                onChange={() => toggle(o.value)}
                className="h-4 w-4"
              />
              {o.label}
            </label>
          ))}
        </div>
        {selected.length > 0 ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
          >
            Limpar seleção
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

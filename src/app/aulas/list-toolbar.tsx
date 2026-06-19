"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ChangeEvent } from "react";

import { Input } from "@/components/ui/input";
import { MultiSelectPopover } from "@/components/multi-select-popover";

type Modality = { id: string; name: string };

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "SCHEDULED", label: "Agendada" },
  { value: "CONFIRMED", label: "Confirmada" },
  { value: "ATTENDED", label: "Compareceu" },
  { value: "NO_SHOW", label: "Faltou" },
  { value: "RESCHEDULED", label: "Remarcada" },
  { value: "CANCELED", label: "Cancelada" },
];

/** Filtros da visão em lista de aulas experimentais (espelha Matrículas). */
export function ExpListToolbar({
  modalities,
  initial,
}: {
  modalities: Modality[];
  initial: { q?: string; statuses?: string[]; modalityIds?: string[] };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(initial.q ?? "");
  const [, startTransition] = useTransition();

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params.toString());
    next.set("view", "lista");
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`/aulas?${next.toString()}`));
  };
  const setMulti = (key: string, values: string[]) =>
    setParam(key, values.length > 0 ? values.join(",") : undefined);

  const onSearch = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setParam("q", e.target.value);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        value={search}
        onChange={onSearch}
        placeholder="Buscar por nome do aluno…"
        className="h-9 w-64"
      />
      <MultiSelectPopover
        options={STATUS_OPTIONS}
        selected={initial.statuses ?? []}
        onChange={(v) => setMulti("status", v)}
        allLabel="Todos status"
        width="w-44"
      />
      <MultiSelectPopover
        options={modalities.map((m) => ({ value: m.id, label: m.name }))}
        selected={initial.modalityIds ?? []}
        onChange={(v) => setMulti("modality", v)}
        allLabel="Todas modalidades"
        width="w-44"
      />
    </div>
  );
}

"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ChangeEvent } from "react";

import { Input } from "@/components/ui/input";
import { MultiSelectPopover } from "@/components/multi-select-popover";

type Option = { id: string; name: string };

type Props = {
  modalities: Option[];
  /** Lista de vendedoras pra filtrar; vazia se o user é SELLER (não pode filtrar). */
  sellers: Option[];
  initial: {
    search?: string;
    modalityIds?: string[];
    assignedSellerIds?: string[];
  };
};

export function KanbanFilters({ modalities, sellers, initial }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(initial.search ?? "");
  const [, startTransition] = useTransition();

  const setMulti = (key: string, values: string[]) => {
    const next = new URLSearchParams(params.toString());
    if (values.length > 0) next.set(key, values.join(","));
    else next.delete(key);
    startTransition(() => {
      router.replace(`/kanban?${next.toString()}`);
    });
  };

  const onSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    const next = new URLSearchParams(params.toString());
    if (value) next.set("q", value);
    else next.delete("q");
    startTransition(() => {
      router.replace(`/kanban?${next.toString()}`);
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        type="search"
        value={search}
        onChange={onSearchChange}
        placeholder="Buscar por nome, telefone ou email…"
        className="h-9 w-72"
      />

      <MultiSelectPopover
        options={modalities.map((m) => ({ value: m.id, label: m.name }))}
        selected={initial.modalityIds ?? []}
        onChange={(v) => setMulti("modality", v)}
        allLabel="Todas modalidades"
        width="w-44"
      />

      {sellers.length > 0 ? (
        <MultiSelectPopover
          options={sellers.map((s) => ({ value: s.id, label: s.name }))}
          selected={initial.assignedSellerIds ?? []}
          onChange={(v) => setMulti("seller", v)}
          allLabel="Todas vendedoras"
          width="w-44"
        />
      ) : null}
    </div>
  );
}

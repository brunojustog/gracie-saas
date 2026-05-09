"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ChangeEvent } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Option = { id: string; name: string };

type Props = {
  modalities: Option[];
  /** Lista de vendedoras pra filtrar; vazia se o user é SELLER (não pode filtrar). */
  sellers: Option[];
  initial: {
    search?: string;
    modalityId?: string;
    assignedSellerId?: string;
  };
};

const ALL = "__all__";

export function KanbanFilters({ modalities, sellers, initial }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(initial.search ?? "");
  const [, startTransition] = useTransition();

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params.toString());
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    startTransition(() => {
      router.replace(`/kanban?${next.toString()}`);
    });
  };

  const onSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearch(value);
    setParam("q", value);
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

      <Select
        value={initial.modalityId ?? ALL}
        onValueChange={(v) => setParam("modality", v)}
      >
        <SelectTrigger className="h-9 w-44">
          <SelectValue placeholder="Modalidade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todas modalidades</SelectItem>
          {modalities.map((m) => (
            <SelectItem key={m.id} value={m.id}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {sellers.length > 0 ? (
        <Select
          value={initial.assignedSellerId ?? ALL}
          onValueChange={(v) => setParam("seller", v)}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Vendedora" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas vendedoras</SelectItem>
            {sellers.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}

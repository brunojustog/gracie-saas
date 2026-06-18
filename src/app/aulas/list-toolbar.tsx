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

type Modality = { id: string; name: string };

const ALL = "__all__";

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
  initial: { q?: string; status?: string; modality?: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(initial.q ?? "");
  const [, startTransition] = useTransition();

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params.toString());
    next.set("view", "lista");
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`/aulas?${next.toString()}`));
  };

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
      <Select value={initial.status ?? ALL} onValueChange={(v) => setParam("status", v)}>
        <SelectTrigger className="h-9 w-44">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos status</SelectItem>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={initial.modality ?? ALL} onValueChange={(v) => setParam("modality", v)}>
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
    </div>
  );
}

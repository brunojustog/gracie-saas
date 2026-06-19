"use client";

import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelectPopover } from "@/components/multi-select-popover";

import { PackageModal, type FormOptions } from "./package-modal";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Em andamento" },
  { value: "COMPLETED", label: "Concluído" },
  { value: "CANCELED", label: "Cancelado" },
];

export function PrivateToolbar({
  options,
  initial,
}: {
  options: FormOptions;
  initial: { q?: string; statuses?: string[] };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(initial.q ?? "");
  const [modalOpen, setModalOpen] = useState(false);
  const [, startTransition] = useTransition();

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`/particulares?${next.toString()}`));
  };
  const setMulti = (key: string, values: string[]) =>
    setParam(key, values.length > 0 ? values.join(",") : undefined);

  const onSearch = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setParam("q", e.target.value);
  };

  return (
    <>
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

        <div className="ml-auto">
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Novo pacote
          </Button>
        </div>
      </div>

      <PackageModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        options={options}
        onSaved={() => startTransition(() => router.refresh())}
      />
    </>
  );
}

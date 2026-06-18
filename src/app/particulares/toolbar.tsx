"use client";

import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { PackageModal, type FormOptions } from "./package-modal";

const ALL = "__all__";

export function PrivateToolbar({
  options,
  initial,
}: {
  options: FormOptions;
  initial: { q?: string; status?: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(initial.q ?? "");
  const [modalOpen, setModalOpen] = useState(false);
  const [, startTransition] = useTransition();

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params.toString());
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`/particulares?${next.toString()}`));
  };

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
        <Select value={initial.status ?? ALL} onValueChange={(v) => setParam("status", v)}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos status</SelectItem>
            <SelectItem value="ACTIVE">Em andamento</SelectItem>
            <SelectItem value="COMPLETED">Concluído</SelectItem>
            <SelectItem value="CANCELED">Cancelado</SelectItem>
          </SelectContent>
        </Select>

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

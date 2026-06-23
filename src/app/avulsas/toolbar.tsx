"use client";

import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { LooseModal, type LooseFormOptions } from "./loose-modal";

export function LooseToolbar({
  options,
  hideFinancials,
  initial,
}: {
  options: LooseFormOptions;
  hideFinancials: boolean;
  initial: { q?: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(initial.q ?? "");
  const [modalOpen, setModalOpen] = useState(false);
  const [, startTransition] = useTransition();

  const onSearch = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    const next = new URLSearchParams(params.toString());
    if (e.target.value) next.set("q", e.target.value);
    else next.delete("q");
    startTransition(() => router.replace(`/avulsas?${next.toString()}`));
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
        <div className="ml-auto">
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Nova aula avulsa
          </Button>
        </div>
      </div>

      <LooseModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        options={options}
        hideFinancials={hideFinancials}
        onSaved={() => startTransition(() => router.refresh())}
      />
    </>
  );
}

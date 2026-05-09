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

import { EnrollmentModal } from "./enrollment-modal";

type Modality = { id: string; name: string };
type Lead = { id: string; name: string; modalityId: string | null };

const ALL = "__all__";

type Props = {
  modalities: Modality[];
  leads: Lead[];
  initial: { search?: string; modalityId?: string; status?: string };
};

export function EnrollmentsToolbar({ modalities, leads, initial }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(initial.search ?? "");
  const [modalOpen, setModalOpen] = useState(false);
  const [, startTransition] = useTransition();

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params.toString());
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    startTransition(() => {
      router.replace(`/matriculas?${next.toString()}`);
    });
  };

  const onSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setParam("q", e.target.value);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="search"
          value={search}
          onChange={onSearchChange}
          placeholder="Buscar por nome do aluno…"
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

        <Select
          value={initial.status ?? ALL}
          onValueChange={(v) => setParam("status", v)}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos status</SelectItem>
            <SelectItem value="ACTIVE">Ativa</SelectItem>
            <SelectItem value="CANCELED">Cancelada</SelectItem>
            <SelectItem value="SUSPENDED">Suspensa</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto">
          <Button onClick={() => setModalOpen(true)}>
            <Plus className="mr-1 h-4 w-4" />
            Nova matrícula
          </Button>
        </div>
      </div>

      <EnrollmentModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        leadOptions={leads}
        onCreated={() => {
          startTransition(() => {
            router.refresh();
          });
        }}
      />
    </>
  );
}

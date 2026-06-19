"use client";

import type { PaymentMethod } from "@prisma/client";
import { Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelectPopover } from "@/components/multi-select-popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { EnrollmentModal } from "./enrollment-modal";

type Modality = { id: string; name: string };
type Plan = { id: string; name: string };
type Lead = { id: string; name: string; modalityId: string | null };

const ALL = "__all__";

const PAYMENT_OPTIONS = [
  { value: "PIX", label: "Pix" },
  { value: "CREDIT_CARD", label: "Cartão" },
  { value: "BOLETO", label: "Boleto" },
  { value: "CASH", label: "Dinheiro" },
  { value: "TRANSFER", label: "Transferência" },
  { value: "OTHER", label: "Outro" },
];

const STATUS_OPTIONS = [
  { value: "ATIVA", label: "Ativa" },
  { value: "CONGELADA", label: "Congelada" },
  { value: "CANCELADA", label: "Cancelada" },
  { value: "JUDICIAL", label: "Judicial" },
];

type Props = {
  modalities: Modality[];
  plans: Plan[];
  leads: Lead[];
  initial: {
    search?: string;
    modalityIds?: string[];
    planIds?: string[];
    paymentMethods?: PaymentMethod[];
    statusViews?: string[];
    due?: string;
    gender?: string;
    dueDay?: number;
  };
};

export function EnrollmentsToolbar({ modalities, plans, leads, initial }: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [search, setSearch] = useState(initial.search ?? "");
  const [modalOpen, setModalOpen] = useState(false);
  const [, startTransition] = useTransition();

  const setParam = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(params.toString());
    if (value && value !== ALL) next.set(key, value);
    else next.delete(key);
    startTransition(() => router.replace(`/matriculas?${next.toString()}`));
  };
  const setMulti = (key: string, values: string[]) =>
    setParam(key, values.length > 0 ? values.join(",") : undefined);

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
          className="h-9 w-64"
        />

        <MultiSelectPopover
          options={modalities.map((m) => ({ value: m.id, label: m.name }))}
          selected={initial.modalityIds ?? []}
          onChange={(v) => setMulti("modality", v)}
          allLabel="Todas modalidades"
        />

        <MultiSelectPopover
          options={STATUS_OPTIONS}
          selected={initial.statusViews ?? []}
          onChange={(v) => setMulti("status", v)}
          allLabel="Todos status"
          width="w-40"
        />

        <MultiSelectPopover
          options={PAYMENT_OPTIONS}
          selected={initial.paymentMethods ?? []}
          onChange={(v) => setMulti("payment", v)}
          allLabel="Todas formas"
          width="w-40"
        />

        <MultiSelectPopover
          options={plans.map((p) => ({ value: p.id, label: p.name }))}
          selected={initial.planIds ?? []}
          onChange={(v) => setMulti("plan", v)}
          allLabel="Todos planos"
          width="w-40"
        />

        <Select value={initial.gender ?? ALL} onValueChange={(v) => setParam("gender", v)}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Sexo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Ambos sexos</SelectItem>
            <SelectItem value="FEMALE">Feminino</SelectItem>
            <SelectItem value="MALE">Masculino</SelectItem>
          </SelectContent>
        </Select>

        <Select value={initial.due ?? ALL} onValueChange={(v) => setParam("due", v)}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Vencimento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Qualquer vencimento</SelectItem>
            <SelectItem value="overdue">Inadimplentes</SelectItem>
            <SelectItem value="due7">Vence em 7 dias</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={initial.dueDay ? String(initial.dueDay) : ALL}
          onValueChange={(v) => setParam("dueDay", v)}
        >
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Dia de vencimento" />
          </SelectTrigger>
          <SelectContent className="max-h-64">
            <SelectItem value={ALL}>Qualquer dia</SelectItem>
            {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
              <SelectItem key={d} value={String(d)}>
                Dia {d}
              </SelectItem>
            ))}
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

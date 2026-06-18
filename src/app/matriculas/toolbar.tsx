"use client";

import type { PaymentMethod } from "@prisma/client";
import { ChevronDown, Plus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, useTransition, type ChangeEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

const PAYMENT_OPTIONS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "PIX", label: "Pix" },
  { value: "CREDIT_CARD", label: "Cartão" },
  { value: "BOLETO", label: "Boleto" },
  { value: "CASH", label: "Dinheiro" },
  { value: "TRANSFER", label: "Transferência" },
  { value: "OTHER", label: "Outro" },
];

type Props = {
  modalities: Modality[];
  plans: Plan[];
  leads: Lead[];
  initial: {
    search?: string;
    modalityIds?: string[];
    planId?: string;
    paymentMethod?: PaymentMethod;
    status?: string;
    due?: string;
    gender?: string;
    dueDay?: number;
  };
};

export function EnrollmentsToolbar({
  modalities,
  plans,
  leads,
  initial,
}: Props) {
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

  const selectedModalities = initial.modalityIds ?? [];
  const toggleModality = (id: string) => {
    const set = new Set(selectedModalities);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    setParam("modality", set.size > 0 ? [...set].join(",") : undefined);
  };

  const onSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
    setParam("q", e.target.value);
  };

  const modalityLabel =
    selectedModalities.length === 0
      ? "Todas modalidades"
      : selectedModalities.length === 1
        ? (modalities.find((m) => m.id === selectedModalities[0])?.name ?? "1 modalidade")
        : `${selectedModalities.length} modalidades`;

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

        {/* Multi-seleção de modalidade (v1.1-AL) */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="h-9 w-48 justify-between font-normal">
              <span className="truncate">{modalityLabel}</span>
              <ChevronDown className="ml-1 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-2">
            <div className="max-h-64 space-y-0.5 overflow-y-auto">
              {modalities.map((m) => {
                const checked = selectedModalities.includes(m.id);
                return (
                  <label
                    key={m.id}
                    className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleModality(m.id)}
                      className="h-4 w-4"
                    />
                    {m.name}
                  </label>
                );
              })}
            </div>
            {selectedModalities.length > 0 ? (
              <button
                type="button"
                onClick={() => setParam("modality", undefined)}
                className="mt-1 w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent"
              >
                Limpar seleção
              </button>
            ) : null}
          </PopoverContent>
        </Popover>

        <Select
          value={initial.planId ?? ALL}
          onValueChange={(v) => setParam("plan", v)}
        >
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Plano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos planos</SelectItem>
            {plans.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={initial.gender ?? ALL}
          onValueChange={(v) => setParam("gender", v)}
        >
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="Sexo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Ambos sexos</SelectItem>
            <SelectItem value="FEMALE">Feminino</SelectItem>
            <SelectItem value="MALE">Masculino</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={initial.paymentMethod ?? ALL}
          onValueChange={(v) => setParam("payment", v)}
        >
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Pagamento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas formas</SelectItem>
            {PAYMENT_OPTIONS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={initial.status ?? ALL}
          onValueChange={(v) => setParam("status", v)}
        >
          <SelectTrigger className="h-9 w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos status</SelectItem>
            <SelectItem value="ACTIVE">Ativa</SelectItem>
            <SelectItem value="CANCELED">Cancelada</SelectItem>
            <SelectItem value="SUSPENDED">Congelada</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={initial.due ?? ALL}
          onValueChange={(v) => setParam("due", v)}
        >
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Vencimento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Qualquer vencimento</SelectItem>
            <SelectItem value="overdue">Inadimplentes</SelectItem>
            <SelectItem value="due7">Vence em 7 dias</SelectItem>
          </SelectContent>
        </Select>

        {/* Dia do mês do vencimento (1-31) */}
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

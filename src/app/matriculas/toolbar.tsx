"use client";

import type { PaymentMethod } from "@prisma/client";
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
    modalityId?: string;
    planId?: string;
    paymentMethod?: PaymentMethod;
    status?: string;
    due?: string;
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
          value={initial.planId ?? ALL}
          onValueChange={(v) => setParam("plan", v)}
        >
          <SelectTrigger className="h-9 w-44">
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
          value={initial.paymentMethod ?? ALL}
          onValueChange={(v) => setParam("payment", v)}
        >
          <SelectTrigger className="h-9 w-44">
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
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos status</SelectItem>
            <SelectItem value="ACTIVE">Ativa</SelectItem>
            <SelectItem value="CANCELED">Cancelada</SelectItem>
            <SelectItem value="SUSPENDED">Congelada</SelectItem>
          </SelectContent>
        </Select>

        {/* v1.1-AB: recorte por vencimento — sempre implica matrícula ativa. */}
        <Select
          value={initial.due ?? ALL}
          onValueChange={(v) => setParam("due", v)}
        >
          <SelectTrigger className="h-9 w-48">
            <SelectValue placeholder="Vencimento" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Qualquer vencimento</SelectItem>
            <SelectItem value="overdue">Inadimplentes</SelectItem>
            <SelectItem value="due7">Vence em 7 dias</SelectItem>
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

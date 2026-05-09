"use client";

import type { PaymentMethod } from "@prisma/client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

import { createEnrollment, getEnrollmentFormOptions } from "./actions";

type LeadOption = { id: string; name: string; modalityId: string | null };
type Modality = { id: string; name: string; color: string | null };
type Plan = { id: string; name: string; monthlyValue: number; modalityId: string | null };

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: "PIX", label: "Pix" },
  { value: "CREDIT_CARD", label: "Cartão de crédito" },
  { value: "BOLETO", label: "Boleto" },
  { value: "CASH", label: "Dinheiro" },
  { value: "TRANSFER", label: "Transferência" },
  { value: "OTHER", label: "Outro" },
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Lead pré-selecionado (vindo do drag do kanban OU do LeadSheet). */
  presetLead?: LeadOption | null;
  /** Pra quando o modal está em /matriculas: usuário escolhe lead da lista. */
  leadOptions?: LeadOption[];
  onCreated?: (enrollmentId: string) => void;
};

export function EnrollmentModal(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {props.open ? <ModalBody key={props.presetLead?.id ?? "picker"} {...props} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function ModalBody({
  onOpenChange,
  presetLead,
  leadOptions,
  onCreated,
}: Props) {
  const [options, setOptions] = useState<{
    modalities: Modality[];
    plans: Plan[];
  } | null>(null);
  const [pending, startTransition] = useTransition();

  // Form state — inicializado a partir do preset, sem effects de reset
  const [leadId, setLeadId] = useState(presetLead?.id ?? "");
  const [modalityId, setModalityId] = useState(presetLead?.modalityId ?? "");
  const [planId, setPlanId] = useState("");
  const [monthlyValue, setMonthlyValue] = useState<string>("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("PIX");
  const [observations, setObservations] = useState("");

  // Carrega opções do servidor uma vez
  useEffect(() => {
    let aborted = false;
    getEnrollmentFormOptions().then((data) => {
      if (!aborted) setOptions(data);
    });
    return () => {
      aborted = true;
    };
  }, []);

  // Quando troca o plano, sugere monthlyValue do plano (mas mantém editável)
  const handlePlanChange = (newPlanId: string) => {
    setPlanId(newPlanId);
    if (!options) return;
    const plan = options.plans.find((p) => p.id === newPlanId);
    if (plan && !monthlyValue) {
      setMonthlyValue(String(plan.monthlyValue));
    }
  };

  // Filtra planos: globais (modalityId=null) + do modality selecionado
  const filteredPlans = useMemo(() => {
    if (!options) return [];
    if (!modalityId) return options.plans;
    return options.plans.filter(
      (p) => p.modalityId === null || p.modalityId === modalityId,
    );
  }, [options, modalityId]);

  const handleSubmit = () => {
    const value = Number(monthlyValue.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Valor mensal inválido");
      return;
    }
    startTransition(async () => {
      const result = await createEnrollment({
        leadId,
        modalityId,
        planId,
        monthlyValue: value,
        paymentMethod,
        observations: observations || undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Matrícula criada — lead promovido pra Matriculado");
      onCreated?.(result.enrollmentId);
      onOpenChange(false);
    });
  };

  if (!options) {
    return (
      <DialogHeader>
        <DialogTitle>Carregando…</DialogTitle>
      </DialogHeader>
    );
  }

  const sortedLeads = (leadOptions ?? []).slice().sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>Nova matrícula</DialogTitle>
        <DialogDescription>
          {presetLead ? (
            <>
              Convertendo <span className="font-medium">{presetLead.name}</span> em
              aluno. Lead será movido pro estágio &quot;Matriculado&quot; automaticamente.
            </>
          ) : (
            "Escolha o lead, modalidade, plano e forma de pagamento."
          )}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        {!presetLead && leadOptions ? (
          <div className="space-y-1">
            <Label htmlFor="lead">Lead</Label>
            <Select value={leadId} onValueChange={setLeadId} disabled={pending}>
              <SelectTrigger id="lead">
                <SelectValue placeholder="Escolha um lead…" />
              </SelectTrigger>
              <SelectContent>
                {sortedLeads.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="modality">Modalidade</Label>
            <Select
              value={modalityId}
              onValueChange={setModalityId}
              disabled={pending}
            >
              <SelectTrigger id="modality">
                <SelectValue placeholder="Escolha…" />
              </SelectTrigger>
              <SelectContent>
                {options.modalities.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: m.color ?? "#6B7280" }}
                        aria-hidden
                      />
                      {m.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="plan">Plano</Label>
            <Select value={planId} onValueChange={handlePlanChange} disabled={pending}>
              <SelectTrigger id="plan">
                <SelectValue placeholder="Escolha…" />
              </SelectTrigger>
              <SelectContent>
                {filteredPlans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ·{" "}
                    {p.monthlyValue.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="value">Valor mensal (R$)</Label>
            <Input
              id="value"
              type="number"
              step="0.01"
              min="0"
              value={monthlyValue}
              onChange={(e) => setMonthlyValue(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="payment">Pagamento</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
              disabled={pending}
            >
              <SelectTrigger id="payment">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-1">
          <Label htmlFor="obs">Observações</Label>
          <Textarea
            id="obs"
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            rows={2}
            placeholder="opcional — desconto, contrato especial, etc."
            disabled={pending}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
          Cancelar
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!leadId || !modalityId || !planId || !monthlyValue || pending}
        >
          {pending ? "Criando…" : "Matricular"}
        </Button>
      </DialogFooter>
    </>
  );
}

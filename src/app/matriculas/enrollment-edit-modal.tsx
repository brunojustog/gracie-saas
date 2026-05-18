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

import { getEnrollmentFormOptions, updateEnrollment } from "./actions";

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

export type EditTarget = {
  id: string;
  leadName: string;
  modalityId: string;
  planId: string;
  monthlyValue: number;
  paymentMethod: PaymentMethod;
  enrolledAt: string; // ISO yyyy-mm-dd
  observations: string | null;
};

type Props = {
  target: EditTarget | null;
  onClose: () => void;
  onUpdated?: () => void;
};

export function EnrollmentEditModal({ target, onClose, onUpdated }: Props) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target ? (
          <ModalBody
            key={target.id}
            target={target}
            onClose={onClose}
            onUpdated={onUpdated}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ModalBody({
  target,
  onClose,
  onUpdated,
}: {
  target: EditTarget;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const [options, setOptions] = useState<{
    modalities: Modality[];
    plans: Plan[];
  } | null>(null);
  const [pending, startTransition] = useTransition();

  // key={target.id} no wrapper força remount, então useState inicia com
  // os valores da matrícula atual sem precisar de useEffect de sync.
  const [modalityId, setModalityId] = useState(target.modalityId);
  const [planId, setPlanId] = useState(target.planId);
  const [monthlyValue, setMonthlyValue] = useState<string>(
    String(target.monthlyValue),
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    target.paymentMethod,
  );
  const [enrolledAt, setEnrolledAt] = useState(target.enrolledAt);
  const [observations, setObservations] = useState(target.observations ?? "");

  useEffect(() => {
    let aborted = false;
    getEnrollmentFormOptions().then((data) => {
      if (!aborted) setOptions(data);
    });
    return () => {
      aborted = true;
    };
  }, []);

  const handlePlanChange = (newPlanId: string) => {
    setPlanId(newPlanId);
    if (!options) return;
    const plan = options.plans.find((p) => p.id === newPlanId);
    // Só sugere o valor do plano se o usuário mudou pra um plano diferente
    // do atual — pra não sobrescrever uma edição manual em curso.
    if (plan && newPlanId !== target.planId) {
      setMonthlyValue(String(plan.monthlyValue));
    }
  };

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
      const result = await updateEnrollment({
        enrollmentId: target.id,
        modalityId,
        planId,
        monthlyValue: value,
        paymentMethod,
        enrolledAt,
        observations: observations.trim() ? observations.trim() : null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Matrícula atualizada");
      onUpdated?.();
      onClose();
    });
  };

  if (!options) {
    return (
      <DialogHeader>
        <DialogTitle>Carregando…</DialogTitle>
      </DialogHeader>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar matrícula</DialogTitle>
        <DialogDescription>
          {target.leadName} — ajustes em plano, valor, pagamento, data ou observações.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="edit-modality">Modalidade</Label>
            <Select
              value={modalityId}
              onValueChange={setModalityId}
              disabled={pending}
            >
              <SelectTrigger id="edit-modality">
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
            <Label htmlFor="edit-plan">Plano</Label>
            <Select value={planId} onValueChange={handlePlanChange} disabled={pending}>
              <SelectTrigger id="edit-plan">
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
            <Label htmlFor="edit-value">Valor mensal (R$)</Label>
            <Input
              id="edit-value"
              type="number"
              step="0.01"
              min="0"
              value={monthlyValue}
              onChange={(e) => setMonthlyValue(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="edit-payment">Pagamento</Label>
            <Select
              value={paymentMethod}
              onValueChange={(v) => setPaymentMethod(v as PaymentMethod)}
              disabled={pending}
            >
              <SelectTrigger id="edit-payment">
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
          <Label htmlFor="edit-enrolledAt">Matriculado em</Label>
          <Input
            id="edit-enrolledAt"
            type="date"
            value={enrolledAt}
            onChange={(e) => setEnrolledAt(e.target.value)}
            disabled={pending}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="edit-obs">Observações</Label>
          <Textarea
            id="edit-obs"
            value={observations}
            onChange={(e) => setObservations(e.target.value)}
            rows={2}
            placeholder="opcional — desconto, contrato especial, etc."
            disabled={pending}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!modalityId || !planId || !monthlyValue || !enrolledAt || pending}
        >
          {pending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </DialogFooter>
    </>
  );
}

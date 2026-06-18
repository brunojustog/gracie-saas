"use client";

import type { Gender, PaymentMethod } from "@prisma/client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";

import { BeltSelect } from "@/components/belt-select";
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

const GENDER_NONE = "__none__";

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
  /** null quando SELLER (valor mascarado no backend). */
  monthlyValue: number | null;
  paymentMethod: PaymentMethod;
  enrolledAt: string; // ISO yyyy-mm-dd
  nextDueDate: string | null; // ISO yyyy-mm-dd
  observations: string | null;
  // v1.1-AL: dados do aluno (Lead) editáveis daqui.
  gender: Gender | null;
  belt: string | null;
  beltDegree: number | null;
};

type Props = {
  target: EditTarget | null;
  onClose: () => void;
  onUpdated?: () => void;
  /**
   * true pra SELLER: esconde o campo de VALOR (mascarado desde v1.1-P) —
   * ela edita modalidade, plano (v1.1-AG: troca de plano é operação de
   * venda; o servidor assume o preço de tabela do plano novo), datas,
   * pagamento e observações. O server-side ignora o valor vindo de SELLER
   * de qualquer forma; isso aqui é só espelho na UI.
   */
  hideFinancials?: boolean;
};

export function EnrollmentEditModal({
  target,
  onClose,
  onUpdated,
  hideFinancials = false,
}: Props) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target ? (
          <ModalBody
            key={target.id}
            target={target}
            onClose={onClose}
            onUpdated={onUpdated}
            hideFinancials={hideFinancials}
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
  hideFinancials,
}: {
  target: EditTarget;
  onClose: () => void;
  onUpdated?: () => void;
  hideFinancials: boolean;
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
    target.monthlyValue !== null ? String(target.monthlyValue) : "",
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    target.paymentMethod,
  );
  const [enrolledAt, setEnrolledAt] = useState(target.enrolledAt);
  const [nextDueDate, setNextDueDate] = useState(target.nextDueDate ?? "");
  const [gender, setGender] = useState<Gender | "">(target.gender ?? "");
  const [belt, setBelt] = useState(target.belt ?? "");
  const [beltDegree, setBeltDegree] = useState(target.beltDegree ?? 0);
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
    let value: number | undefined;
    if (!hideFinancials) {
      value = Number(monthlyValue.replace(",", "."));
      if (!Number.isFinite(value) || value <= 0) {
        toast.error("Valor mensal inválido");
        return;
      }
    }
    startTransition(async () => {
      const result = await updateEnrollment({
        enrollmentId: target.id,
        modalityId,
        planId,
        // Valor nem é enviado por SELLER (o server ignoraria de qualquer
        // forma — troca de plano assume o preço de tabela).
        ...(hideFinancials ? {} : { monthlyValue: value }),
        paymentMethod,
        enrolledAt,
        nextDueDate: nextDueDate || null,
        observations: observations.trim() ? observations.trim() : null,
        gender: gender || null,
        belt: belt || null,
        beltDegree: belt ? beltDegree : null,
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

  const submitDisabled =
    pending ||
    !enrolledAt ||
    !modalityId ||
    !planId ||
    (!hideFinancials && !monthlyValue);

  return (
    <>
      <DialogHeader>
        <DialogTitle>Editar matrícula</DialogTitle>
        <DialogDescription>
          {target.leadName} —{" "}
          {hideFinancials
            ? "ajustes em plano, datas, pagamento ou observações. Trocar de plano aplica o preço de tabela do plano novo."
            : "ajustes em plano, valor, pagamento, datas ou observações."}
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

        <div className={`grid gap-3 ${hideFinancials ? "grid-cols-1" : "grid-cols-2"}`}>
          {hideFinancials ? null : (
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
          )}
          <div className="space-y-1">
            <Label htmlFor="edit-payment">Pagamento</Label>
            <PaymentSelect
              value={paymentMethod}
              onChange={setPaymentMethod}
              disabled={pending}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
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
            <Label htmlFor="edit-nextDueDate">Próximo vencimento</Label>
            <Input
              id="edit-nextDueDate"
              type="date"
              value={nextDueDate}
              onChange={(e) => setNextDueDate(e.target.value)}
              disabled={pending}
            />
            <p className="text-[11px] text-muted-foreground">
              Vazio = sem controle de vencimento.
            </p>
          </div>
        </div>

        {/* Dados do aluno (v1.1-AL): sexo + graduação */}
        <div className="space-y-1">
          <Label htmlFor="edit-gender">Sexo</Label>
          <Select
            value={gender === "" ? GENDER_NONE : gender}
            onValueChange={(v) => setGender(v === GENDER_NONE ? "" : (v as Gender))}
            disabled={pending}
          >
            <SelectTrigger id="edit-gender">
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={GENDER_NONE}>Não informado</SelectItem>
              <SelectItem value="FEMALE">Feminino</SelectItem>
              <SelectItem value="MALE">Masculino</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <BeltSelect
          belt={belt}
          degree={beltDegree}
          onBeltChange={setBelt}
          onDegreeChange={setBeltDegree}
          disabled={pending}
          idPrefix="edit"
        />

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
        <Button onClick={handleSubmit} disabled={submitDisabled}>
          {pending ? "Salvando…" : "Salvar alterações"}
        </Button>
      </DialogFooter>
    </>
  );
}

function PaymentSelect({
  value,
  onChange,
  disabled,
}: {
  value: PaymentMethod;
  onChange: (v: PaymentMethod) => void;
  disabled: boolean;
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => onChange(v as PaymentMethod)}
      disabled={disabled}
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
  );
}

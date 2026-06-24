"use client";

import type { EnrollmentStatus, PaymentMethod } from "@prisma/client";
import { differenceInCalendarDays, format, startOfDay } from "date-fns";
import {
  Banknote,
  CalendarCheck,
  Gavel,
  PencilLine,
  Play,
  Snowflake,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { OVERDUE_GRACE_DAYS } from "@/lib/overdue";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  cancelEnrollment,
  confirmPayment,
  markEnrollmentJudicial,
  payEnrollmentInFull,
  reactivateEnrollment,
  suspendEnrollment,
} from "./actions";
import { CollectionNotesButton } from "@/app/dashboard/collection-notes";

import { EnrollmentEditModal, type EditTarget } from "./enrollment-edit-modal";

type Row = {
  id: string;
  enrolledAt: Date | string;
  canceledAt: Date | string | null;
  suspendedAt: Date | string | null;
  suspensionReason: string | null;
  frozenKind: string | null;
  expectedReturnAt: Date | string | null;
  frozenDaysUsed: number;
  contractEndAt: Date | string | null;
  nextDueDate: Date | string | null;
  paidInFullUntil: Date | string | null;
  // null quando SELLER — backend mascara pra não vazar receita.
  monthlyValue: number | string | { toString(): string } | null;
  paymentMethod: PaymentMethod;
  status: EnrollmentStatus;
  observations: string | null;
  lead: {
    id: string;
    name: string;
    phone: string | null;
    gender: "FEMALE" | "MALE" | null;
    belt: string | null;
    beltDegree: number | null;
    assignedSeller: { id: string; name: string | null; email: string } | null;
  };
  modality: { id: string; name: string; color: string | null };
  plan: { id: string; name: string };
};

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  PIX: "Pix",
  CREDIT_CARD: "Cartão",
  BOLETO: "Boleto",
  CASH: "Dinheiro",
  TRANSFER: "Transferência",
  OTHER: "Outro",
};

/**
 * Situação visual (v1.1-AT/AU): congelada deixou de ser status no banco
 * (é ACTIVE + suspendedAt). Aqui derivamos o rótulo/cor.
 */
function statusView(r: { status: EnrollmentStatus; suspendedAt: Date | string | null }): {
  label: string;
  tone: string;
} {
  if (r.status === "CANCELED")
    return { label: "cancelada", tone: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200" };
  if (r.status === "JUDICIAL")
    return { label: "judicial", tone: "bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-200" };
  if (r.suspendedAt)
    return { label: "congelada", tone: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200" };
  return { label: "ativa", tone: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200" };
}

export function EnrollmentsTable({
  rows,
  hideFinancials = false,
}: {
  rows: Row[];
  hideFinancials?: boolean;
}) {
  const router = useRouter();
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);
  const [freezeTarget, setFreezeTarget] = useState<Row | null>(null);
  const [judicialTarget, setJudicialTarget] = useState<Row | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [payTarget, setPayTarget] = useState<Row | null>(null);
  const [payFullTarget, setPayFullTarget] = useState<Row | null>(null);
  const [pending, startTransition] = useTransition();

  // v1.1-AB: SELLER também edita — o modal esconde os campos financeiros
  // (hideFinancials) e o server ignora qualquer campo financeiro de SELLER.
  const handleEdit = (row: Row) => {
    setEditTarget({
      id: row.id,
      leadName: row.lead.name,
      modalityId: row.modality.id,
      planId: row.plan.id,
      monthlyValue: row.monthlyValue !== null ? Number(row.monthlyValue) : null,
      paymentMethod: row.paymentMethod,
      enrolledAt: new Date(row.enrolledAt).toISOString().slice(0, 10),
      nextDueDate: row.nextDueDate
        ? new Date(row.nextDueDate).toISOString().slice(0, 10)
        : null,
      observations: row.observations,
      gender: row.lead.gender,
      belt: row.lead.belt,
      beltDegree: row.lead.beltDegree,
    });
  };

  const handleReactivate = (row: Row) => {
    startTransition(async () => {
      const result = await reactivateEnrollment({ enrollmentId: row.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Matrícula reativada");
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
        Nenhuma matrícula encontrada com os filtros atuais.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Aluno</TableHead>
              <TableHead>Modalidade</TableHead>
              <TableHead>Plano</TableHead>
              {hideFinancials ? null : <TableHead className="text-right">Valor</TableHead>}
              <TableHead>Pagamento</TableHead>
              <TableHead>Vendedora</TableHead>
              <TableHead>Matriculado em</TableHead>
              <TableHead>Vencimento</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-[120px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const value =
                r.monthlyValue !== null ? Number(r.monthlyValue) : null;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.lead.name}</TableCell>
                  <TableCell>
                    <span className="flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: r.modality.color ?? "#6B7280" }}
                        aria-hidden
                      />
                      {r.modality.name}
                    </span>
                  </TableCell>
                  <TableCell>{r.plan.name}</TableCell>
                  {hideFinancials || value === null ? null : (
                    <TableCell className="text-right font-mono">
                      {value.toLocaleString("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      })}
                    </TableCell>
                  )}
                  <TableCell className="text-muted-foreground">
                    {PAYMENT_LABEL[r.paymentMethod]}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.lead.assignedSeller?.name ?? r.lead.assignedSeller?.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(r.enrolledAt), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell>
                    <DueDateCell row={r} />
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const sv = statusView(r);
                      const frozen = r.status === "ACTIVE" && r.suspendedAt;
                      return (
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-block w-fit rounded-full px-2 py-0.5 text-xs ${sv.tone}`}>
                            {sv.label}
                          </span>
                          {frozen && r.expectedReturnAt ? (
                            <span className="text-[10px] text-muted-foreground" title={r.suspensionReason ?? undefined}>
                              retorna {format(new Date(r.expectedReturnAt), "dd/MM/yyyy")}
                            </span>
                          ) : null}
                          {r.frozenDaysUsed > 0 ? (
                            <span className="text-[10px] text-muted-foreground">
                              {r.frozenDaysUsed}d a repor
                            </span>
                          ) : null}
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleEdit(r)}
                        disabled={pending}
                        title="Editar matrícula"
                        aria-label="Editar matrícula"
                      >
                        <PencilLine className="h-4 w-4" />
                      </Button>
                      {r.status === "ACTIVE" || r.status === "JUDICIAL" ? (
                        <CollectionNotesButton
                          enrollmentId={r.id}
                          leadName={r.lead.name}
                        />
                      ) : null}
                      {r.status === "ACTIVE" && !r.suspendedAt ? (
                        <>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                            onClick={() => setPayTarget(r)}
                            disabled={pending}
                            title="Confirmar pagamento da mensalidade"
                            aria-label="Confirmar pagamento da mensalidade"
                          >
                            <Banknote className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                            onClick={() => setPayFullTarget(r)}
                            disabled={pending}
                            title="Pagamento total (quitar vários meses)"
                            aria-label="Pagamento total (quitar vários meses)"
                          >
                            <CalendarCheck className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-sky-700 hover:bg-sky-50 dark:text-sky-300 dark:hover:bg-sky-950/40"
                            onClick={() => setFreezeTarget(r)}
                            disabled={pending}
                            title="Congelar matrícula"
                            aria-label="Congelar matrícula"
                          >
                            <Snowflake className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                            onClick={() => setCancelTarget(r)}
                            disabled={pending}
                            title="Cancelar matrícula"
                            aria-label="Cancelar matrícula"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-purple-700 hover:bg-purple-50 dark:text-purple-300 dark:hover:bg-purple-950/40"
                            onClick={() => setJudicialTarget(r)}
                            disabled={pending}
                            title="Mover para cobrança judicial"
                            aria-label="Mover para cobrança judicial"
                          >
                            <Gavel className="h-4 w-4" />
                          </Button>
                        </>
                      ) : null}
                      {r.status === "ACTIVE" && r.suspendedAt ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-950/40"
                          onClick={() => handleReactivate(r)}
                          disabled={pending}
                          title="Descongelar matrícula"
                          aria-label="Descongelar matrícula"
                        >
                          <Play className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <CancelDialog
        target={cancelTarget}
        onClose={() => setCancelTarget(null)}
      />
      <FreezeDialog
        target={freezeTarget}
        onClose={() => setFreezeTarget(null)}
      />
      <JudicialDialog
        target={judicialTarget}
        onClose={() => setJudicialTarget(null)}
      />
      <ConfirmPaymentDialog
        target={payTarget}
        onClose={() => setPayTarget(null)}
      />
      <PayInFullDialog
        target={payFullTarget}
        onClose={() => setPayFullTarget(null)}
      />
      <EnrollmentEditModal
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onUpdated={() => router.refresh()}
        hideFinancials={hideFinancials}
      />
    </>
  );
}

/**
 * Vencimento + estado derivado (v1.1-AQ): vermelho "inadimplente" só após a
 * carência de {OVERDUE_GRACE_DAYS} dias; dentro da carência fica âmbar
 * "venceu há Xd · em carência"; âmbar "vence em Xd" quando está a ≤3 dias.
 * Só matrícula ATIVA cobra.
 */
function DueDateCell({ row }: { row: Row }) {
  if (!row.nextDueDate) {
    return <span className="text-muted-foreground">—</span>;
  }
  const due = new Date(row.nextDueDate);
  const days = differenceInCalendarDays(startOfDay(due), startOfDay(new Date()));
  const daysPast = -days; // positivo quando já venceu
  // v1.1-BB: quitado = paidInFullUntil no futuro → some da cobrança mensal.
  const prepaid =
    row.paidInFullUntil != null &&
    startOfDay(new Date(row.paidInFullUntil)) >= startOfDay(new Date());
  const isBillable = row.status === "ACTIVE" && !prepaid;
  const inadimplente = isBillable && daysPast >= OVERDUE_GRACE_DAYS;
  const emCarencia = isBillable && daysPast > 0 && daysPast < OVERDUE_GRACE_DAYS;

  return (
    <div className="flex flex-col gap-0.5">
      <span className={inadimplente ? "font-medium text-red-700 dark:text-red-300" : "text-muted-foreground"}>
        {format(due, "dd/MM/yyyy")}
      </span>
      {prepaid ? (
        <span className="inline-block w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
          quitado até {format(new Date(row.paidInFullUntil!), "dd/MM/yyyy")}
        </span>
      ) : null}
      {inadimplente ? (
        <span className="inline-block w-fit rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-900 dark:bg-red-900/40 dark:text-red-200">
          inadimplente · venceu há {daysPast}d
        </span>
      ) : null}
      {emCarencia ? (
        <span className="inline-block w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          venceu há {daysPast}d · em carência
        </span>
      ) : null}
      {isBillable && days >= 0 && days <= 3 ? (
        <span className="inline-block w-fit rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          {days === 0 ? "vence hoje" : `vence em ${days}d`}
        </span>
      ) : null}
    </div>
  );
}

function ConfirmPaymentDialog({
  target,
  onClose,
}: {
  target: Row | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target ? (
          <ConfirmPaymentBody key={target.id} target={target} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ConfirmPaymentBody({ target, onClose }: { target: Row; onClose: () => void }) {
  const router = useRouter();
  const [paidAt, setPaidAt] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [pending, startTransition] = useTransition();

  const dueLabel = target.nextDueDate
    ? format(new Date(target.nextDueDate), "dd/MM/yyyy")
    : null;

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await confirmPayment({
        enrollmentId: target.id,
        paidAt,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Pagamento confirmado — vencimento avançado 1 mês");
      onClose();
      router.refresh();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Confirmar pagamento</DialogTitle>
        <DialogDescription>
          {target.lead.name} — {target.modality.name} ({target.plan.name})
          {dueLabel ? ` · vencimento atual: ${dueLabel}` : ""}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="pay-date">Data do pagamento</Label>
          <Input
            id="pay-date"
            type="date"
            value={paidAt}
            onChange={(e) => setPaidAt(e.target.value)}
            disabled={pending}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Registra a mensalidade como paga e avança o vencimento em 1 mês.
          Cada confirmação quita <strong>uma</strong> mensalidade — aluno com
          mais de um mês em aberto continua na lista até quitar tudo.
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Voltar
        </Button>
        <Button onClick={handleConfirm} disabled={pending || !paidAt}>
          {pending ? "Confirmando…" : "Confirmar pagamento"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ── Pagamento TOTAL / quitação (v1.1-BB) ────────────────────────────────────

function PayInFullDialog({
  target,
  onClose,
}: {
  target: Row | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target ? <PayInFullBody key={target.id} target={target} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PayInFullBody({ target, onClose }: { target: Row; onClose: () => void }) {
  const router = useRouter();
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [months, setMonths] = useState("12");
  const monthly = target.monthlyValue !== null ? Number(target.monthlyValue) : null;
  const monthsNum = Number(months);
  const [amount, setAmount] = useState(() =>
    monthly !== null ? String(monthly * 12) : "",
  );
  const [pending, startTransition] = useTransition();

  // Sugere o total = meses × mensalidade quando o usuário muda os meses.
  const onMonthsChange = (v: string) => {
    setMonths(v);
    const n = Number(v);
    if (monthly !== null && Number.isInteger(n) && n > 0) {
      setAmount(String(monthly * n));
    }
  };

  const handleConfirm = () => {
    const n = Number(months);
    if (!Number.isInteger(n) || n < 1) {
      toast.error("informe quantos meses foram quitados");
      return;
    }
    startTransition(async () => {
      const result = await payEnrollmentInFull({
        enrollmentId: target.id,
        months: n,
        paidAt,
        totalAmount: amount.trim() ? Number(amount) : undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Quitação registrada — sai da cobrança mensal");
      onClose();
      router.refresh();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Pagamento total (quitação)</DialogTitle>
        <DialogDescription>
          {target.lead.name} — {target.modality.name} ({target.plan.name})
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="pf-months">Meses quitados</Label>
            <Input
              id="pf-months"
              type="number"
              min={1}
              max={60}
              value={months}
              onChange={(e) => onMonthsChange(e.target.value)}
              disabled={pending}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="pf-date">Data do pagamento</Label>
            <Input
              id="pf-date"
              type="date"
              value={paidAt}
              onChange={(e) => setPaidAt(e.target.value)}
              disabled={pending}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pf-amount">Valor total pago (R$)</Label>
          <Input
            id="pf-amount"
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            disabled={pending}
            placeholder={monthly !== null ? String(monthly * monthsNum) : ""}
          />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Empurra o vencimento {Number.isInteger(monthsNum) && monthsNum > 0 ? `${monthsNum} ` : ""}
          meses pra frente e marca como <strong>quitado</strong>: o aluno
          continua ativo, mas <strong>sai da receita mensal recorrente</strong>{" "}
          e dos vencimentos/inadimplência até a data de quitação.
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Voltar
        </Button>
        <Button onClick={handleConfirm} disabled={pending}>
          {pending ? "Registrando…" : "Registrar quitação"}
        </Button>
      </DialogFooter>
    </>
  );
}

function CancelDialog({
  target,
  onClose,
}: {
  target: Row | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target ? <CancelBody key={target.id} target={target} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function CancelBody({ target, onClose }: { target: Row; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [moveToLost, setMoveToLost] = useState(true);
  const [pending, startTransition] = useTransition();

  const handleCancel = () => {
    startTransition(async () => {
      const result = await cancelEnrollment({
        enrollmentId: target.id,
        reason: reason || undefined,
        moveToLost,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Matrícula cancelada");
      onClose();
      router.refresh();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Cancelar matrícula</DialogTitle>
        <DialogDescription>
          {target.lead.name} — {target.modality.name} ({target.plan.name})
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="reason">Motivo (opcional)</Label>
          <Textarea
            id="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="ex: mudou de cidade, motivo financeiro…"
            disabled={pending}
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={moveToLost}
            onChange={(e) => setMoveToLost(e.target.checked)}
            disabled={pending}
            className="h-4 w-4"
          />
          Mover lead para &quot;Aluno Perdido&quot; no kanban
        </label>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Voltar
        </Button>
        <Button
          variant="destructive"
          onClick={handleCancel}
          disabled={pending}
        >
          {pending ? "Cancelando…" : "Confirmar cancelamento"}
        </Button>
      </DialogFooter>
    </>
  );
}

function FreezeDialog({
  target,
  onClose,
}: {
  target: Row | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target ? <FreezeBody key={target.id} target={target} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function FreezeBody({ target, onClose }: { target: Row; onClose: () => void }) {
  // key={target.id} no wrapper força remount entre alvos diferentes, então
  // useState inicia natural a cada novo congelamento. Sem useEffect.
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [frozenKind, setFrozenKind] = useState<"DOENCA" | "FERIAS">("DOENCA");
  const [expectedReturnAt, setExpectedReturnAt] = useState("");
  const [pending, startTransition] = useTransition();

  const handleConfirm = () => {
    if (!reason.trim()) {
      toast.error("Informe o motivo do congelamento");
      return;
    }
    startTransition(async () => {
      const result = await suspendEnrollment({
        enrollmentId: target.id,
        reason: reason.trim(),
        frozenKind,
        expectedReturnAt: expectedReturnAt || null,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Matrícula congelada");
      onClose();
      router.refresh();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Congelar matrícula</DialogTitle>
        <DialogDescription>
          {target.lead.name} — continua ativo e cobrando; os dias congelados
          são repostos no fim do contrato.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="freeze-kind">Tipo</Label>
          <Select
            value={frozenKind}
            onValueChange={(v) => setFrozenKind(v as "DOENCA" | "FERIAS")}
            disabled={pending}
          >
            <SelectTrigger id="freeze-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DOENCA">Doença (repõe o tempo do atestado)</SelectItem>
              <SelectItem value="FERIAS">Férias (limite de 30 dias)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="freeze-reason">
            Motivo <span className="text-red-500">*</span>
          </Label>
          <Textarea
            id="freeze-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="ex: lesão no joelho, viagem 3 meses…"
            disabled={pending}
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="freeze-return">Data prevista de retorno (opcional)</Label>
          <Input
            id="freeze-return"
            type="date"
            value={expectedReturnAt}
            onChange={(e) => setExpectedReturnAt(e.target.value)}
            disabled={pending}
          />
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Voltar
        </Button>
        <Button onClick={handleConfirm} disabled={pending}>
          {pending ? "Congelando…" : "Confirmar congelamento"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Judicial (v1.1-AU)
// ──────────────────────────────────────────────────────────────────────────

function JudicialDialog({ target, onClose }: { target: Row | null; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target ? <JudicialBody key={target.id} target={target} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function JudicialBody({ target, onClose }: { target: Row; onClose: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await markEnrollmentJudicial({
        enrollmentId: target.id,
        reason: reason.trim() || undefined,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Movido para cobrança judicial");
      onClose();
      router.refresh();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Mover para cobrança judicial</DialogTitle>
        <DialogDescription>
          {target.lead.name} — sai dos alunos ativos e entra na carteira
          jurídica (conta como cancelamento). Use pra quem sumiu devendo e não
          pagou a multa.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-1">
        <Label htmlFor="judicial-reason">Observação (opcional)</Label>
        <Textarea
          id="judicial-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="ex: deve 3 mensalidades + kimono; sem retorno desde maio…"
          disabled={pending}
        />
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Voltar
        </Button>
        <Button variant="destructive" onClick={handleConfirm} disabled={pending}>
          {pending ? "Movendo…" : "Confirmar (judicial)"}
        </Button>
      </DialogFooter>
    </>
  );
}

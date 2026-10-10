"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, ChevronLeft, ChevronRight, History, Loader2, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { Money } from "@/components/money";
import { cn } from "@/lib/utils";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment-methods";
import type { FinancialOverview, FinancialRow, FinancialStatus, OverdueRow } from "@/server/financial";

import { confirmPayment, reversePayment } from "../matriculas/actions";
import { addCollectionNote, getCollectionNotes, type CollectionNote } from "../dashboard/collection-actions";
import { getEnrollmentPaymentHistory, type PaymentHistoryRow } from "./actions";

type Filter = "all" | FinancialStatus;
type Mode = "month" | "total";
type Bucket = "all" | "d30" | "d60" | "d90" | "d90p";

function shiftMonth(ref: string, delta: number): string {
  const [y, m] = ref.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const STATUS_META: Record<FinancialStatus, { label: string; dot: string; text: string }> = {
  paid: { label: "Pago", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  due: { label: "No prazo", dot: "bg-amber-400", text: "text-amber-700 dark:text-amber-400" },
  overdue: { label: "Inadimplente", dot: "bg-red-500", text: "text-red-700 dark:text-red-400" },
  paused: { label: "Pausado", dot: "bg-slate-400", text: "text-slate-600 dark:text-slate-300" },
};

const d = (x: Date | string | null) => (x ? format(new Date(x), "dd/MM/yyyy", { locale: ptBR }) : "—");

export function FinanceiroView({ overview }: { overview: FinancialOverview }) {
  const [mode, setMode] = useState<Mode>("month");
  const [filter, setFilter] = useState<Filter>("all");
  const [bucket, setBucket] = useState<Bucket>("all");
  // Dialogs compartilhados.
  const [payTarget, setPayTarget] = useState<{ id: string; name: string; due: Date | null } | null>(null);
  const [histTarget, setHistTarget] = useState<{ id: string; name: string } | null>(null);

  const prevMonth = shiftMonth(overview.monthRef, -1);
  const nextMonth = shiftMonth(overview.monthRef, 1);

  const rows = useMemo(() => {
    if (filter === "all") return overview.rows;
    return overview.rows.filter((r) => r.status === filter);
  }, [overview.rows, filter]);

  const overdueByBucket = useMemo(() => {
    const b = (days: number): Bucket => (days <= 30 ? "d30" : days <= 60 ? "d60" : days <= 90 ? "d90" : "d90p");
    const counts: Record<Bucket, number> = { all: overview.overdueAll.length, d30: 0, d60: 0, d90: 0, d90p: 0 };
    for (const r of overview.overdueAll) counts[b(r.daysOverdue)]++;
    const list = bucket === "all" ? overview.overdueAll : overview.overdueAll.filter((r) => b(r.daysOverdue) === bucket);
    return { counts, list };
  }, [overview.overdueAll, bucket]);

  return (
    <div className="space-y-4">
      {/* Modo: do mês × inadimplência total */}
      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1">
        <TabBtn active={mode === "month"} onClick={() => setMode("month")}>Do mês</TabBtn>
        <TabBtn active={mode === "total"} onClick={() => setMode("total")}>
          Inadimplência total ({overview.overdueAll.length})
        </TabBtn>
      </div>

      {mode === "month" ? (
        <>
          {/* Navegação de mês */}
          <div className="flex items-center justify-center gap-3">
            <Link href={`/financeiro?month=${prevMonth}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted" aria-label="Mês anterior">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <span className="min-w-44 text-center text-sm font-medium capitalize">{overview.monthLabel}</span>
            <Link href={`/financeiro?month=${nextMonth}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md border hover:bg-muted" aria-label="Próximo mês">
              <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {overview.canSeeTotals ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg border bg-card p-4">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Previsto</div>
                <div className="mt-1 text-2xl font-semibold"><Money value={overview.previsto} /></div>
                <div className="text-[11px] text-muted-foreground">mensalidades ativas (fora as pausadas)</div>
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Recebido</div>
                <div className="mt-1 text-2xl font-semibold text-emerald-700 dark:text-emerald-400"><Money value={overview.recebido} /></div>
                <div className="text-[11px] text-muted-foreground">
                  baixas no mês ·{" "}
                  {overview.previsto && overview.recebido != null && overview.previsto > 0
                    ? `${Math.round((overview.recebido / overview.previsto) * 100)}% do previsto`
                    : "—"}
                </div>
              </div>
            </div>
          ) : null}

          {/* Semáforo clicável */}
          <div className="grid grid-cols-5 gap-2">
            <CountChip active={filter === "all"} onClick={() => setFilter("all")} label="Todas" count={overview.rows.length} tone="neutral" />
            <CountChip active={filter === "paid"} onClick={() => setFilter(filter === "paid" ? "all" : "paid")} label="Pagas" count={overview.pagosCount} tone="green" />
            <CountChip active={filter === "due"} onClick={() => setFilter(filter === "due" ? "all" : "due")} label="No prazo" count={overview.naoPagosCount - overview.overdueCount} tone="amber" />
            <CountChip active={filter === "overdue"} onClick={() => setFilter(filter === "overdue" ? "all" : "overdue")} label="Inadimpl. do mês" count={overview.overdueCount} tone="red" />
            <CountChip active={filter === "paused"} onClick={() => setFilter(filter === "paused" ? "all" : "paused")} label="Pausados" count={overview.pausedCount} tone="neutral" />
          </div>

          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma matrícula nesta situação.</p>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Aluno</th>
                    <th className="px-3 py-2 text-left font-medium">Plano</th>
                    <th className="px-3 py-2 text-right font-medium">Vencimento</th>
                    <th className="px-3 py-2 text-right font-medium">Pagamento</th>
                    <th className="px-3 py-2 text-right font-medium">Valor</th>
                    <th className="px-3 py-2 text-right font-medium">Situação</th>
                    <th className="px-3 py-2 text-right font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <MonthRow
                      key={r.enrollmentId}
                      r={r}
                      onPay={() => setPayTarget({ id: r.enrollmentId, name: r.leadName, due: r.nextDueDate })}
                      onHistory={() => setHistTarget({ id: r.enrollmentId, name: r.leadName })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Semáforo: <b>verde</b> pago no mês · <b>âmbar</b> no prazo · <b>vermelho</b> vencido · <b>cinza</b> pausado (sem receita).
          </p>
        </>
      ) : (
        <>
          {/* Inadimplência total por tempo de atraso */}
          <div className="grid grid-cols-5 gap-2">
            <CountChip active={bucket === "all"} onClick={() => setBucket("all")} label="Todos" count={overdueByBucket.counts.all} tone="red" />
            <CountChip active={bucket === "d30"} onClick={() => setBucket(bucket === "d30" ? "all" : "d30")} label="≤ 30d" count={overdueByBucket.counts.d30} tone="amber" />
            <CountChip active={bucket === "d60"} onClick={() => setBucket(bucket === "d60" ? "all" : "d60")} label="31–60d" count={overdueByBucket.counts.d60} tone="amber" />
            <CountChip active={bucket === "d90"} onClick={() => setBucket(bucket === "d90" ? "all" : "d90")} label="61–90d" count={overdueByBucket.counts.d90} tone="red" />
            <CountChip active={bucket === "d90p"} onClick={() => setBucket(bucket === "d90p" ? "all" : "d90p")} label="90d+" count={overdueByBucket.counts.d90p} tone="red" />
          </div>
          {overdueByBucket.list.length === 0 ? (
            <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Ninguém devendo nesta faixa. 🎉</p>
          ) : (
            <div className="overflow-hidden rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Aluno</th>
                    <th className="px-3 py-2 text-right font-medium">Vence desde</th>
                    <th className="px-3 py-2 text-right font-medium">Atraso</th>
                    <th className="px-3 py-2 text-right font-medium">Mensalidade</th>
                    <th className="px-3 py-2 text-right font-medium">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueByBucket.list.map((r) => (
                    <TotalRow
                      key={r.enrollmentId}
                      r={r}
                      onPay={() => setPayTarget({ id: r.enrollmentId, name: r.leadName, due: r.nextDueDate })}
                      onHistory={() => setHistTarget({ id: r.enrollmentId, name: r.leadName })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">
            Inadimplência <b>total</b> = quem deve qualquer mês (vencido além da carência), separado por tempo de atraso.
          </p>
        </>
      )}

      <PayDialog target={payTarget} onClose={() => setPayTarget(null)} />
      <HistoryDialog target={histTarget} onClose={() => setHistTarget(null)} />
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function CountChip({
  active, onClick, label, count, tone,
}: {
  active: boolean; onClick: () => void; label: string; count: number;
  tone: "neutral" | "green" | "amber" | "red";
}) {
  const toneCls =
    tone === "green" ? "text-emerald-700 dark:text-emerald-400"
      : tone === "amber" ? "text-amber-700 dark:text-amber-400"
        : tone === "red" ? "text-red-700 dark:text-red-400"
          : "text-foreground";
  return (
    <button type="button" onClick={onClick} className={cn("rounded-lg border bg-card px-2 py-2 text-center transition-colors hover:bg-muted/50", active && "ring-2 ring-primary")}>
      <div className={cn("text-xl font-semibold tabular-nums", toneCls)}>{count}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </button>
  );
}

function HistoryBtn({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={onClick} title="Histórico de pagamentos e observações">
      <History className="h-3.5 w-3.5" />
    </Button>
  );
}

function MonthRow({ r, onPay, onHistory }: { r: FinancialRow; onPay: () => void; onHistory: () => void }) {
  const meta = STATUS_META[r.status];
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">
        <button type="button" onClick={onHistory} className="text-left font-medium hover:underline">{r.leadName}</button>
        {r.payerName ? (
          <div className="text-[11px] text-muted-foreground">resp.: <span className="font-medium text-foreground">{r.payerName}</span></div>
        ) : null}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{r.planName}<span className="text-[11px]"> · {r.modalityName}</span></td>
      <td className="px-3 py-2 text-right">
        {r.paid && r.paidAt ? (
          <span className="text-emerald-700 dark:text-emerald-400">pago {d(r.paidAt)}</span>
        ) : r.nextDueDate ? (
          <span className={r.status === "overdue" ? "font-medium text-red-700 dark:text-red-400" : ""}>
            {d(r.nextDueDate)}
            {r.status === "overdue" ? <span className="block text-[11px]">há {r.daysOverdue}d</span> : null}
          </span>
        ) : "—"}
      </td>
      <td className="px-3 py-2 text-right text-xs text-muted-foreground">{r.paymentMethod ? PAYMENT_METHOD_LABELS[r.paymentMethod] : "—"}</td>
      <td className="px-3 py-2 text-right font-mono text-xs"><Money value={r.paid && r.paidAmount != null ? r.paidAmount : r.monthlyValue} /></td>
      <td className="px-3 py-2 text-right">
        <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", meta.text)}>
          <span className={cn("h-2 w-2 rounded-full", meta.dot)} /> {meta.label}
        </span>
      </td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-0.5">
          <HistoryBtn onClick={onHistory} />
          {r.status === "paid" || r.status === "paused" ? (
            <span className="text-[11px] text-muted-foreground">{r.status === "paused" ? "pausado" : "✓"}</span>
          ) : (
            <Button size="sm" className="h-7 text-xs" onClick={onPay}>
              <Check className="mr-1 h-3.5 w-3.5" /> Pagar
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}

function TotalRow({ r, onPay, onHistory }: { r: OverdueRow; onPay: () => void; onHistory: () => void }) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2">
        <button type="button" onClick={onHistory} className="text-left font-medium hover:underline">{r.leadName}</button>
        {r.payerName ? (
          <div className="text-[11px] text-muted-foreground">resp.: <span className="font-medium text-foreground">{r.payerName}</span></div>
        ) : null}
      </td>
      <td className="px-3 py-2 text-right font-medium text-red-700 dark:text-red-400">{d(r.nextDueDate)}</td>
      <td className="px-3 py-2 text-right text-xs">{r.daysOverdue}d</td>
      <td className="px-3 py-2 text-right font-mono text-xs"><Money value={r.monthlyValue} /></td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-0.5">
          <HistoryBtn onClick={onHistory} />
          <Button size="sm" className="h-7 text-xs" onClick={onPay}>
            <Check className="mr-1 h-3.5 w-3.5" /> Pagar
          </Button>
        </div>
      </td>
    </tr>
  );
}

// ── Diálogo: confirmar pagamento com DATA (igual matrículas) — v1.2-CD ──────
function PayDialog({ target, onClose }: { target: { id: string; name: string; due: Date | null } | null; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {target ? <PayBody key={target.id} target={target} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function PayBody({ target, onClose }: { target: { id: string; name: string; due: Date | null }; onClose: () => void }) {
  const router = useRouter();
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [pending, startTransition] = useTransition();

  const confirm = () =>
    startTransition(async () => {
      const r = await confirmPayment({ enrollmentId: target.id, paidAt });
      if (!r.ok) return void toast.error(r.error ?? "erro");
      toast.success("Pagamento confirmado — vencimento avançado 1 mês");
      onClose();
      router.refresh();
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Confirmar pagamento</DialogTitle>
        <DialogDescription>
          {target.name}{target.due ? ` · vencimento: ${d(target.due)}` : ""}
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="fin-pay-date">Data do pagamento</Label>
          <Input id="fin-pay-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} disabled={pending} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Registra a mensalidade como paga e avança o vencimento em 1 mês. Cada confirmação quita <b>uma</b> mensalidade.
        </p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>Voltar</Button>
        <Button onClick={confirm} disabled={pending || !paidAt}>
          {pending ? "Confirmando…" : "Confirmar pagamento"}
        </Button>
      </DialogFooter>
    </>
  );
}

// ── Diálogo: histórico de pagamentos + observações + estorno — v1.2-CD ──────
function HistoryDialog({ target, onClose }: { target: { id: string; name: string } | null; onClose: () => void }) {
  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {target ? <HistoryBody key={target.id} target={target} onClose={onClose} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function HistoryBody({ target, onClose }: { target: { id: string; name: string }; onClose: () => void }) {
  const router = useRouter();
  const [payments, setPayments] = useState<PaymentHistoryRow[] | null>(null);
  const [notes, setNotes] = useState<CollectionNote[] | null>(null);
  const [obs, setObs] = useState("");
  const [pending, startTransition] = useTransition();

  const load = () => {
    getEnrollmentPaymentHistory(target.id).then(setPayments);
    getCollectionNotes(target.id).then(setNotes);
  };
  // Carrega ao montar.
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.id]);

  const addObs = () => {
    const text = obs.trim();
    if (!text) return;
    startTransition(async () => {
      const r = await addCollectionNote({ enrollmentId: target.id, body: text });
      if (!r.ok) return void toast.error(r.error);
      setObs("");
      toast.success("Observação registrada");
      getCollectionNotes(target.id).then(setNotes);
    });
  };

  const estornar = (paymentHint: string) =>
    startTransition(async () => {
      if (!window.confirm(`Estornar o último pagamento de ${target.name}? ${paymentHint}`)) return;
      const r = await reversePayment({ enrollmentId: target.id });
      if (!r.ok) return void toast.error(r.error ?? "erro");
      toast.success("Pagamento estornado");
      load();
      router.refresh();
    });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{target.name}</DialogTitle>
        <DialogDescription>Histórico de pagamentos e observações de cobrança.</DialogDescription>
      </DialogHeader>

      <div className="max-h-[60vh] space-y-4 overflow-y-auto">
        <section>
          <div className="mb-1 flex items-center justify-between">
            <h4 className="text-sm font-semibold">Pagamentos</h4>
            {payments && payments.length > 0 ? (
              <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" disabled={pending} onClick={() => estornar(`Baixa de ${d(payments[0].paidAt)}.`)}>
                <Undo2 className="mr-1 h-3.5 w-3.5" /> Estornar último
              </Button>
            ) : null}
          </div>
          {payments === null ? (
            <p className="text-xs text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> carregando…</p>
          ) : payments.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum pagamento registrado.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded border px-2.5 py-1.5">
                  <span>
                    <b>{d(p.paidAt)}</b>
                    {p.dueDate ? <span className="text-[11px] text-muted-foreground"> · venc. {d(p.dueDate)}</span> : null}
                    {p.method ? <span className="text-[11px] text-muted-foreground"> · {PAYMENT_METHOD_LABELS[p.method]}</span> : null}
                  </span>
                  <span className="font-mono text-xs"><Money value={p.amount} /></span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4 className="mb-1 text-sm font-semibold">Observações</h4>
          <div className="flex gap-2">
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="ex: aluno no Japão, cancelou o cartão…" disabled={pending} />
            <Button size="sm" onClick={addObs} disabled={pending || !obs.trim()}>Salvar</Button>
          </div>
          {notes === null ? (
            <p className="mt-2 text-xs text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> carregando…</p>
          ) : notes.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Nenhuma observação ainda.</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {notes.map((n) => (
                <li key={n.id} className="rounded border px-2.5 py-1.5">
                  <div>{n.body}</div>
                  <div className="text-[11px] text-muted-foreground">{d(n.createdAt)}{n.author ? ` · ${n.author}` : ""}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>Fechar</Button>
      </DialogFooter>
    </>
  );
}

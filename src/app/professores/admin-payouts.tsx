"use client";

import { ChevronLeft, ChevronRight, FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { togglePaid } from "./payout-actions";

export type AdminPayoutItem = {
  id: string;
  professorName: string;
  total: number;
  regular: number;
  aux: number;
  particular: number;
  conv: number;
  paid: boolean;
  received: boolean;
  invoiceId: string | null;
  invoiceName: string | null;
};

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function AdminPayouts({
  payouts,
  monthLabel,
  prevMonth,
  nextMonth,
  totalGeral,
}: {
  payouts: AdminPayoutItem[];
  monthLabel: string;
  prevMonth: string;
  nextMonth: string | null;
  totalGeral: number;
}) {
  const [pending, startTransition] = useTransition();

  const setPaid = (id: string, paid: boolean) =>
    startTransition(async () => {
      const r = await togglePaid({ payoutId: id, paid });
      if (!r.ok) toast.error(r.error);
    });

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold">Fechamentos mensais</h2>
          <p className="text-xs text-muted-foreground">
            Congelado no fim do mês · pagar até dia 7. Marque “Pago”; o professor
            confirma “Recebido” e envia a NF.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={`/professores?payoutMonth=${prevMonth}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border hover:bg-accent"
            aria-label="Mês anterior"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-24 text-center text-sm font-medium capitalize">
            {monthLabel}
          </span>
          {nextMonth ? (
            <Link
              href={`/professores?payoutMonth=${nextMonth}`}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border hover:bg-accent"
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border opacity-30">
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>

      {payouts.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">
          Nenhum fechamento nesse mês.
        </p>
      ) : (
        <div className="space-y-2">
          {payouts.map((p) => (
            <div key={p.id} className="rounded-lg border p-2.5">
              <div className="flex items-center justify-between">
                <span className="font-medium">{p.professorName}</span>
                <span className="text-sm font-bold text-emerald-700 tabular-nums dark:text-emerald-300">
                  {brl(p.total)}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
                {p.regular > 0 ? <span>regulares {brl(p.regular)}</span> : null}
                {p.aux > 0 ? <span>auxílios {brl(p.aux)}</span> : null}
                {p.particular > 0 ? <span>particulares {brl(p.particular)}</span> : null}
                {p.conv > 0 ? <span>conversões {brl(p.conv)}</span> : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {p.paid ? (
                  <Button size="sm" variant="secondary" disabled={pending} onClick={() => setPaid(p.id, false)}>
                    ✓ Pago
                  </Button>
                ) : (
                  <Button size="sm" disabled={pending} onClick={() => setPaid(p.id, true)}>
                    Marcar pago
                  </Button>
                )}
                {p.received ? (
                  <span className="rounded bg-emerald-100 px-1.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400">
                    recebido pelo professor
                  </span>
                ) : (
                  <span className="text-[11px] text-muted-foreground">aguardando o professor confirmar</span>
                )}
                {p.invoiceId ? (
                  <a
                    href={`/api/professor/invoice/${p.invoiceId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" /> NF
                  </a>
                ) : null}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-end gap-2 border-t pt-2 text-sm">
            <span className="text-muted-foreground">Total do mês:</span>
            <span className="font-bold text-emerald-700 tabular-nums dark:text-emerald-300">{brl(totalGeral)}</span>
          </div>
        </div>
      )}

      {pending ? (
        <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> processando…
        </p>
      ) : null}
    </section>
  );
}

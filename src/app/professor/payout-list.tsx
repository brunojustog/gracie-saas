"use client";

import { Check, FileText, Loader2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { toggleReceived } from "./actions";
import { uploadInvoice } from "./invoice-actions";

export type PayoutItem = {
  id: string;
  competencia: string;
  compLabel: string;
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

export function PayoutList({ payouts }: { payouts: PayoutItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const setReceived = (id: string, received: boolean) =>
    startTransition(async () => {
      const r = await toggleReceived({ payoutId: id, received });
      if (!r.ok) return void toast.error(r.error);
      router.refresh();
    });

  const sendNf = (competencia: string, file: File) => {
    const fd = new FormData();
    fd.set("competencia", competencia);
    fd.set("file", file);
    startTransition(async () => {
      const r = await uploadInvoice(fd);
      if (!r.ok) return void toast.error(r.error);
      toast.success("Nota fiscal enviada");
      router.refresh();
    });
  };

  if (payouts.length === 0) {
    return (
      <p className="rounded-lg border bg-card p-4 text-center text-xs text-muted-foreground">
        Nenhum mês fechado ainda. O fechamento acontece no último dia do mês.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {payouts.map((p) => (
        <div key={p.id} className="rounded-xl border bg-card p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-semibold capitalize">{p.compLabel}</span>
              {p.paid ? (
                <span className="rounded bg-emerald-500/15 px-1.5 text-[10px] font-medium text-emerald-500">
                  pago
                </span>
              ) : (
                <span className="rounded bg-muted px-1.5 text-[10px] text-muted-foreground">
                  a pagar
                </span>
              )}
            </div>
            <span className="text-sm font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
              {brl(p.total)}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
            {p.regular > 0 ? <span>regulares {brl(p.regular)}</span> : null}
            {p.aux > 0 ? <span>auxílios {brl(p.aux)}</span> : null}
            {p.particular > 0 ? <span>particulares {brl(p.particular)}</span> : null}
            {p.conv > 0 ? <span>conversões {brl(p.conv)}</span> : null}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 border-t pt-2">
            {p.received ? (
              <Button size="sm" variant="secondary" disabled={pending} onClick={() => setReceived(p.id, false)}>
                <Check className="mr-1 h-4 w-4" /> Recebido
              </Button>
            ) : (
              <Button size="sm" disabled={pending} onClick={() => setReceived(p.id, true)}>
                Marcar recebido
              </Button>
            )}

            {/* NF só depois de recebido (fluxo do Anderson). */}
            {p.received ? (
              p.invoiceId ? (
                <a
                  href={`/api/professor/invoice/${p.invoiceId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <FileText className="h-3.5 w-3.5" /> {p.invoiceName ?? "nota fiscal"}
                </a>
              ) : (
                <>
                  <input
                    ref={(el) => { fileRefs.current[p.id] = el; }}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) sendNf(p.competencia, f);
                    }}
                  />
                  <Button size="sm" variant="outline" disabled={pending} onClick={() => fileRefs.current[p.id]?.click()}>
                    <Upload className="mr-1 h-4 w-4" /> Enviar nota fiscal
                  </Button>
                </>
              )
            ) : (
              <span className="text-[11px] text-muted-foreground">
                marque “recebido” pra enviar a nota fiscal
              </span>
            )}
          </div>
        </div>
      ))}
      {pending ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> processando…
        </p>
      ) : null}
    </div>
  );
}

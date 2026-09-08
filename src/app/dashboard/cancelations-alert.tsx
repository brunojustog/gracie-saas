"use client";

import { format } from "date-fns";
import { AlertTriangle, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import type { PendingCancellation } from "@/server/enrollments";

import {
  cancelEnrollment,
  confirmExitFeePaid,
  confirmRecurrenceCanceled,
} from "../matriculas/actions";

const d = (x: Date | string | null) => (x ? format(new Date(x), "dd/MM/yy") : null);

/**
 * v1.2-AP: alerta de solicitações de cancelamento pendentes no dashboard.
 * Mostra cada etapa do fluxo (taxa paga → recorrência cancelada → efetivar) e
 * deixa a atendente confirmar direto daqui. Some quando não há pendências.
 */
export function CancelationsAlert({ rows }: { rows: PendingCancellation[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (rows.length === 0) return null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error ?? "erro");
      toast.success(ok);
      router.refresh();
    });

  return (
    <section className="overflow-hidden rounded-xl border-2 border-red-400 bg-red-50 dark:border-red-700 dark:bg-red-950/40">
      <div className="flex items-center gap-2 border-b border-red-200 bg-red-100 px-4 py-2 dark:border-red-800 dark:bg-red-900/40">
        <AlertTriangle className="h-4 w-4 animate-pulse text-red-600 dark:text-red-300" />
        <h3 className="text-sm font-bold text-red-800 dark:text-red-200">
          Solicitações de cancelamento pendentes ({rows.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-red-200 text-left text-[10px] uppercase text-red-700/70 dark:border-red-800 dark:text-red-300/70">
              <th className="px-3 py-1.5 font-medium">Aluno</th>
              <th className="px-3 py-1.5 font-medium">Plano</th>
              <th className="px-3 py-1.5 font-medium">Venc.</th>
              <th className="px-3 py-1.5 font-medium">Vendedora</th>
              <th className="px-3 py-1.5 font-medium">Solicitado</th>
              <th className="px-3 py-1.5 font-medium">Taxa paga</th>
              <th className="px-3 py-1.5 font-medium">Recorrência</th>
              <th className="px-3 py-1.5 text-right font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const taxa = d(r.taxaPagaEm);
              const rec = d(r.recorrenciaCanceladaEm);
              return (
                <tr key={r.enrollmentId} className="border-b border-red-100 last:border-0 dark:border-red-900">
                  <td className="px-3 py-2 font-medium">{r.alunoNome}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.plano}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{d(r.vencimento) ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{r.vendedora ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">{d(r.solicitadoEm) ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">
                    {taxa ? <span className="text-emerald-700 dark:text-emerald-300">✓ {taxa}</span> : <span className="text-muted-foreground">pendente</span>}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {rec ? <span className="text-emerald-700 dark:text-emerald-300">✓ {rec}</span> : <span className="text-muted-foreground">pendente</span>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {!r.taxaPagaEm ? (
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        disabled={pending}
                        onClick={() => run(() => confirmExitFeePaid({ enrollmentId: r.enrollmentId }), "Taxa confirmada · aviso enviado à Gisele")}
                      >
                        Confirmar taxa paga
                      </Button>
                    ) : !r.recorrenciaCanceladaEm ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={pending}
                        onClick={() => run(() => confirmRecurrenceCanceled({ enrollmentId: r.enrollmentId }), "Recorrência marcada como cancelada")}
                      >
                        Gisele cancelou a recorrência
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        className="h-7 bg-red-600 text-xs text-white hover:bg-red-700"
                        disabled={pending}
                        onClick={() => run(() => cancelEnrollment({ enrollmentId: r.enrollmentId, mode: "effected" }), "Cancelamento efetivado")}
                      >
                        <Check className="mr-1 h-3.5 w-3.5" /> Efetivar
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {pending ? (
        <div className="flex items-center gap-1 px-3 py-1.5 text-[11px] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> processando…
        </div>
      ) : null}
    </section>
  );
}

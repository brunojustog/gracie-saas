"use client";

import { format } from "date-fns";
import { CalendarPlus, Check, Loader2, Snowflake } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { FrozenEnrollment } from "@/server/enrollments";

import { extendFreeze, reactivateEnrollment } from "../matriculas/actions";

const d = (x: Date | string | null) => (x ? format(new Date(x), "dd/MM/yy") : null);

/**
 * v1.2-BX: alerta de alunos congelados no dashboard. Mostra a data de retorno
 * prevista e destaca quem já deveria ter voltado (o sistema descongela sozinho
 * no cron diário; aqui a atendente também pode descongelar na hora). Some
 * quando não há congelados.
 */
export function FrozenAlert({ rows }: { rows: FrozenEnrollment[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [extendId, setExtendId] = useState<string | null>(null);
  const [extDate, setExtDate] = useState("");
  const [extReason, setExtReason] = useState("");

  if (rows.length === 0) return null;

  const unfreeze = (enrollmentId: string) =>
    startTransition(async () => {
      const r = await reactivateEnrollment({ enrollmentId });
      if (!r.ok) return void toast.error(r.error ?? "erro");
      toast.success("Aluno descongelado");
      router.refresh();
    });

  const openExtend = (id: string) => {
    setExtendId(id);
    setExtDate("");
    setExtReason("");
  };

  const confirmExtend = (enrollmentId: string) =>
    startTransition(async () => {
      if (!extDate) return void toast.error("Escolha a nova data de retorno");
      if (!extReason.trim()) return void toast.error("Informe o motivo");
      const r = await extendFreeze({ enrollmentId, expectedReturnAt: extDate, reason: extReason.trim() });
      if (!r.ok) return void toast.error(r.error ?? "erro");
      toast.success("Congelamento estendido");
      setExtendId(null);
      router.refresh();
    });

  const overdueCount = rows.filter((r) => r.overdue).length;

  return (
    <section className="overflow-hidden rounded-xl border-2 border-sky-300 bg-sky-50 dark:border-sky-800 dark:bg-sky-950/40">
      <div className="flex items-center gap-2 border-b border-sky-200 bg-sky-100 px-4 py-2 dark:border-sky-800 dark:bg-sky-900/40">
        <Snowflake className="h-4 w-4 text-sky-600 dark:text-sky-300" />
        <h3 className="text-sm font-bold text-sky-800 dark:text-sky-200">
          Alunos congelados ({rows.length})
          {overdueCount > 0 ? (
            <span className="ml-2 font-medium text-amber-700 dark:text-amber-300">
              · {overdueCount} com retorno vencido
            </span>
          ) : null}
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-sky-200 text-left text-[10px] uppercase text-sky-700/70 dark:border-sky-800 dark:text-sky-300/70">
              <th className="px-3 py-1.5 font-medium">Aluno</th>
              <th className="px-3 py-1.5 font-medium">Tipo</th>
              <th className="px-3 py-1.5 font-medium">Congelado em</th>
              <th className="px-3 py-1.5 font-medium">Retorno previsto</th>
              <th className="px-3 py-1.5 text-right font-medium">Ação</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.enrollmentId} className="border-b border-sky-100 last:border-0 dark:border-sky-900">
                <td className="px-3 py-2 font-medium">
                  {r.alunoId ? (
                    <Link href={`/settings/alunos/${r.alunoId}`} className="hover:underline">
                      {r.alunoNome}
                    </Link>
                  ) : (
                    r.alunoNome
                  )}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.frozenKind === "FERIAS" ? "Férias" : r.frozenKind === "DOENCA" ? "Atestado" : "—"}
                </td>
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{d(r.suspendedAt) ?? "—"}</td>
                <td className="px-3 py-2 tabular-nums">
                  {r.expectedReturnAt ? (
                    <span className={r.overdue ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground"}>
                      {d(r.expectedReturnAt)}
                      {r.overdue ? " (vencido)" : ""}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">sem data</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      disabled={pending}
                      onClick={() => openExtend(r.enrollmentId)}
                    >
                      <CalendarPlus className="mr-1 h-3.5 w-3.5" /> Estender
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      disabled={pending}
                      onClick={() => unfreeze(r.enrollmentId)}
                    >
                      <Check className="mr-1 h-3.5 w-3.5" /> Descongelar
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {extendId ? (
              <tr className="border-b border-sky-100 bg-sky-50/60 dark:border-sky-900 dark:bg-sky-950/30">
                <td colSpan={5} className="px-3 py-2">
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="space-y-0.5">
                      <label className="text-[10px] uppercase text-muted-foreground">Novo retorno</label>
                      <Input type="date" value={extDate} onChange={(e) => setExtDate(e.target.value)} className="h-8 w-40 text-xs" disabled={pending} />
                    </div>
                    <div className="flex-1 space-y-0.5" style={{ minWidth: 180 }}>
                      <label className="text-[10px] uppercase text-muted-foreground">Motivo do aumento</label>
                      <Input value={extReason} onChange={(e) => setExtReason(e.target.value)} placeholder="ex: novo atestado 30 dias" className="h-8 text-xs" disabled={pending} />
                    </div>
                    <Button size="sm" className="h-8 text-xs" disabled={pending} onClick={() => confirmExtend(extendId)}>
                      Salvar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 text-xs" disabled={pending} onClick={() => setExtendId(null)}>
                      Cancelar
                    </Button>
                  </div>
                </td>
              </tr>
            ) : null}
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

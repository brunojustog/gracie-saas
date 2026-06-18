"use client";

import type { PaymentMethod, PrivatePackageStatus } from "@prisma/client";
import { format } from "date-fns";
import { CalendarDays, PencilLine, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import { formatBelt } from "@/lib/belts";

import { cancelPrivatePackage } from "./actions";
import { PackageModal, type EditPackage, type FormOptions } from "./package-modal";
import { SessionsModal, type SessionsTarget } from "./sessions-modal";

type SessionRow = {
  id: string;
  scheduledDate: Date | string | null;
  completedAt: Date | string | null;
  notes: string | null;
};

type Row = {
  id: string;
  modalityId: string | null;
  totalClasses: number;
  value: number | string | { toString(): string } | null;
  paymentMethod: PaymentMethod | null;
  status: PrivatePackageStatus;
  startDate: Date | string;
  endDate: Date | string | null;
  soldById: string | null;
  notes: string | null;
  completedCount: number;
  lead: {
    id: string;
    name: string;
    phone: string | null;
    gender: "FEMALE" | "MALE" | null;
    belt: string | null;
    beltDegree: number | null;
  };
  modality: { id: string; name: string; color: string | null } | null;
  soldBy: { name: string | null; email: string } | null;
  sessions: SessionRow[];
};

const STATUS_LABEL: Record<PrivatePackageStatus, string> = {
  ACTIVE: "Em andamento",
  COMPLETED: "Concluído",
  CANCELED: "Cancelado",
};
const STATUS_TONE: Record<PrivatePackageStatus, string> = {
  ACTIVE: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  COMPLETED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  CANCELED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

const toISODate = (d: Date | string) => new Date(d).toISOString().slice(0, 10);

export function PackagesTable({
  rows,
  options,
  hideFinancials = false,
}: {
  rows: Row[];
  options: FormOptions;
  hideFinancials?: boolean;
}) {
  const router = useRouter();
  const [editTarget, setEditTarget] = useState<EditPackage | null>(null);
  const [sessionsTarget, setSessionsTarget] = useState<SessionsTarget | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Row | null>(null);

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
        Nenhum pacote de aulas particulares com os filtros atuais.
      </div>
    );
  }

  const openEdit = (r: Row) =>
    setEditTarget({
      id: r.id,
      leadName: r.lead.name,
      modalityId: r.modalityId,
      totalClasses: r.totalClasses,
      value: r.value != null ? Number(r.value) : null,
      paymentMethod: r.paymentMethod,
      startDate: toISODate(r.startDate),
      endDate: r.endDate ? toISODate(r.endDate) : null,
      soldById: r.soldById,
      notes: r.notes,
    });

  return (
    <>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left font-medium">Aluno</th>
              <th className="px-3 py-2 text-left font-medium">Modalidade</th>
              <th className="px-3 py-2 text-left font-medium">Progresso</th>
              {hideFinancials ? null : (
                <th className="px-3 py-2 text-right font-medium">Valor</th>
              )}
              <th className="px-3 py-2 text-left font-medium">Início</th>
              <th className="px-3 py-2 text-left font-medium">Status</th>
              <th className="px-3 py-2 text-right font-medium">Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const value = r.value != null ? Number(r.value) : null;
              const pct = Math.min(100, Math.round((r.completedCount / r.totalClasses) * 100));
              return (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-2">
                    <div className="font-medium">{r.lead.name}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {[r.lead.phone, formatBelt(r.lead.belt, r.lead.beltDegree) !== "—" ? formatBelt(r.lead.belt, r.lead.beltDegree) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {r.modality ? (
                      <span className="flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: r.modality.color ?? "#6B7280" }}
                          aria-hidden
                        />
                        {r.modality.name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full bg-emerald-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs tabular-nums">
                        {r.completedCount}/{r.totalClasses}
                      </span>
                    </div>
                  </td>
                  {hideFinancials ? null : (
                    <td className="px-3 py-2 text-right font-mono text-xs">
                      {value != null
                        ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "—"}
                    </td>
                  )}
                  <td className="px-3 py-2 text-muted-foreground">
                    {format(new Date(r.startDate), "dd/MM/yy")}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs ${STATUS_TONE[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Gerenciar aulas"
                        aria-label="Gerenciar aulas"
                        onClick={() =>
                          setSessionsTarget({
                            id: r.id,
                            leadName: r.lead.name,
                            totalClasses: r.totalClasses,
                            sessions: r.sessions,
                          })
                        }
                      >
                        <CalendarDays className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        title="Editar pacote"
                        aria-label="Editar pacote"
                        onClick={() => openEdit(r)}
                      >
                        <PencilLine className="h-4 w-4" />
                      </Button>
                      {r.status !== "CANCELED" ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                          title="Cancelar pacote"
                          aria-label="Cancelar pacote"
                          onClick={() => setCancelTarget(r)}
                        >
                          <XCircle className="h-4 w-4" />
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <PackageModal
        open={editTarget !== null}
        onOpenChange={(o) => !o && setEditTarget(null)}
        options={options}
        editing={editTarget}
        hideFinancials={hideFinancials}
        onSaved={() => router.refresh()}
      />
      <SessionsModal target={sessionsTarget} onClose={() => setSessionsTarget(null)} />
      <CancelDialog target={cancelTarget} onClose={() => setCancelTarget(null)} />
    </>
  );
}

function CancelDialog({ target, onClose }: { target: Row | null; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleCancel = () => {
    if (!target) return;
    startTransition(async () => {
      const result = await cancelPrivatePackage({ packageId: target.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Pacote cancelado");
      onClose();
      router.refresh();
    });
  };

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Cancelar pacote</DialogTitle>
          <DialogDescription>
            {target?.lead.name} — o pacote sai da contagem de ativos. As aulas já
            registradas ficam no histórico.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Voltar
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={pending}>
            {pending ? "Cancelando…" : "Confirmar cancelamento"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";

import type { PaymentMethod } from "@prisma/client";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { deleteLooseClass } from "./actions";

const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  PIX: "Pix",
  CREDIT_CARD: "Cartão",
  BOLETO: "Boleto",
  CASH: "Dinheiro",
  TRANSFER: "Transferência",
  OTHER: "Outro",
};

type Row = {
  id: string;
  value: number | string | { toString(): string } | null;
  classDate: Date | string;
  paymentMethod: PaymentMethod | null;
  notes: string | null;
  lead: { id: string; name: string; phone: string | null };
  modality: { id: string; name: string; color: string | null } | null;
  soldBy: { name: string | null; email: string } | null;
};

export function LooseTable({
  rows,
  hideFinancials = false,
}: {
  rows: Row[];
  hideFinancials?: boolean;
}) {
  const router = useRouter();
  const [delTarget, setDelTarget] = useState<Row | null>(null);
  const [pending, startTransition] = useTransition();

  const handleDelete = () => {
    if (!delTarget) return;
    startTransition(async () => {
      const result = await deleteLooseClass({ id: delTarget.id });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Aula avulsa excluída");
      setDelTarget(null);
      router.refresh();
    });
  };

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
        Nenhuma aula avulsa registrada ainda.
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
              <TableHead>Data</TableHead>
              {hideFinancials ? null : <TableHead className="text-right">Valor</TableHead>}
              <TableHead>Pagamento</TableHead>
              <TableHead>Vendedora</TableHead>
              <TableHead className="w-[60px] text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const value = r.value !== null ? Number(r.value) : null;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    {r.lead.name}
                    {r.lead.phone ? (
                      <div className="text-[11px] text-muted-foreground">{r.lead.phone}</div>
                    ) : null}
                  </TableCell>
                  <TableCell>{r.modality?.name ?? "—"}</TableCell>
                  <TableCell>{format(new Date(r.classDate), "dd/MM/yyyy")}</TableCell>
                  {hideFinancials ? null : (
                    <TableCell className="text-right font-mono text-xs">
                      {value !== null
                        ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                        : "—"}
                    </TableCell>
                  )}
                  <TableCell>
                    {r.paymentMethod ? PAYMENT_LABEL[r.paymentMethod] : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {r.soldBy?.name ?? r.soldBy?.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40"
                      onClick={() => setDelTarget(r)}
                      disabled={pending}
                      title="Excluir aula avulsa"
                      aria-label="Excluir aula avulsa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <Dialog open={delTarget !== null} onOpenChange={(o) => !o && setDelTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir aula avulsa</DialogTitle>
            <DialogDescription>
              {delTarget?.lead.name} — {format(new Date(delTarget?.classDate ?? new Date()), "dd/MM/yyyy")}.
              Essa ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelTarget(null)} disabled={pending}>
              Voltar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={pending}>
              {pending ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

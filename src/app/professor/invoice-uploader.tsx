"use client";

import { FileText, Loader2, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { deleteInvoice, uploadInvoice } from "./invoice-actions";

export type InvoiceItem = {
  id: string;
  competencia: string;
  fileName: string;
  size: number;
  uploadedAtISO: string;
};

const MESES = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

/** "2026-08" → "ago/2026". */
function competenciaLabel(c: string): string {
  const [y, m] = c.split("-");
  const mi = Number(m) - 1;
  return `${MESES[mi] ?? m}/${y}`;
}

function sizeLabel(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function InvoiceUploader({
  invoices,
  defaultCompetencia,
}: {
  invoices: InvoiceItem[];
  defaultCompetencia: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [competencia, setCompetencia] = useState(defaultCompetencia);
  const fileRef = useRef<HTMLInputElement>(null);

  const onSubmit = () => {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      toast.error("Selecione um PDF pra anexar");
      return;
    }
    const fd = new FormData();
    fd.set("competencia", competencia);
    fd.set("file", file);
    startTransition(async () => {
      const r = await uploadInvoice(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Nota fiscal enviada");
      if (fileRef.current) fileRef.current.value = "";
      router.refresh();
    });
  };

  const onDelete = (id: string) =>
    startTransition(async () => {
      const r = await deleteInvoice({ id });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Nota fiscal removida");
      router.refresh();
    });

  return (
    <section className="space-y-2 rounded-xl border bg-card p-4">
      <div>
        <h3 className="text-sm font-semibold">Nota fiscal</h3>
        <p className="text-xs text-muted-foreground">
          Anexe o PDF da sua NF do mês. O Anderson acessa pra fazer o pagamento.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs">
          <span className="mb-0.5 block text-muted-foreground">Mês de referência</span>
          <Input
            type="month"
            value={competencia}
            onChange={(e) => setCompetencia(e.target.value)}
            disabled={pending}
            className="h-9 w-auto"
          />
        </label>
        <label className="min-w-0 flex-1 text-xs">
          <span className="mb-0.5 block text-muted-foreground">Arquivo (PDF)</span>
          <Input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf"
            disabled={pending}
            className="h-9 cursor-pointer"
          />
        </label>
        <Button size="sm" className="h-9" disabled={pending} onClick={onSubmit}>
          <Upload className="mr-1 h-4 w-4" /> Enviar NF
        </Button>
      </div>

      {invoices.length > 0 ? (
        <ul className="space-y-1 pt-1">
          {invoices.map((inv) => (
            <li
              key={inv.id}
              className="flex items-center gap-2 rounded-lg border bg-background/60 p-2 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <a
                href={`/api/professor/invoice/${inv.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 truncate font-medium text-primary hover:underline"
                title={inv.fileName}
              >
                {inv.fileName}
              </a>
              <span className="shrink-0 rounded bg-muted px-1.5 text-[10px] font-medium text-muted-foreground">
                {competenciaLabel(inv.competencia)}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {sizeLabel(inv.size)}
              </span>
              <button
                type="button"
                onClick={() => onDelete(inv.id)}
                disabled={pending}
                className="shrink-0 text-muted-foreground hover:text-destructive"
                title="Remover"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pt-1 text-xs text-muted-foreground">
          Nenhuma NF enviada ainda.
        </p>
      )}

      {pending ? (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> processando…
        </p>
      ) : null}
    </section>
  );
}

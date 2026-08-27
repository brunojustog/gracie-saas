"use client";

import { Printer } from "lucide-react";

/** Botão de imprimir/salvar PDF do relatório (v1.2-AA). */
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90"
    >
      <Printer className="h-4 w-4" /> Imprimir / salvar PDF
    </button>
  );
}

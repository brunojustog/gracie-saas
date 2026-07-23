"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Botão "Imprimir / Salvar PDF" — usa o print nativo do navegador. */
export function PrintButton() {
  return (
    <Button size="sm" onClick={() => window.print()}>
      <Printer className="mr-1 h-4 w-4" />
      Imprimir / Salvar PDF
    </Button>
  );
}

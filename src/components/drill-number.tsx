"use client";

import { useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/** Um item da lista de drill-down (v1.1-AY). */
export type DrillItem = {
  id: string;
  name: string;
  sub?: string | null;
  href?: string;
};

/**
 * Número clicável que abre um popup com a LISTA de nomes por trás dele
 * (v1.1-AY, "números clicáveis"). Se `items` vier vazio, renderiza o número
 * sem interação. Reutilizado no Quadro, Dashboard e agenda.
 */
export function DrillNumber({
  value,
  title,
  items,
  className,
  emptyLabel = "Nenhum registro.",
  variant = "link",
}: {
  value: React.ReactNode;
  title: string;
  items: DrillItem[];
  className?: string;
  emptyLabel?: string;
  /** "link" sublinha o número; "plain" mantém o estilo do conteúdo (chips). */
  variant?: "link" | "plain";
}) {
  const [open, setOpen] = useState(false);

  if (items.length === 0) {
    return <span className={className}>{value}</span>;
  }

  const triggerClass =
    variant === "plain"
      ? `cursor-pointer hover:opacity-80 ${className ?? ""}`
      : `cursor-pointer underline decoration-dotted underline-offset-2 hover:text-primary ${className ?? ""}`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={triggerClass}
        title="Ver nomes"
      >
        {value}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[80vh] gap-3 overflow-hidden">
          <DialogHeader>
            <DialogTitle>
              {title} · {items.length}
            </DialogTitle>
          </DialogHeader>
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">{emptyLabel}</p>
          ) : (
            <div className="max-h-[60vh] space-y-0.5 overflow-y-auto pr-1">
              {items.map((it) => (
                <div
                  key={it.id}
                  className="flex items-baseline justify-between gap-3 rounded px-2 py-1.5 text-sm hover:bg-accent"
                >
                  {it.href ? (
                    <a href={it.href} className="font-medium hover:underline">
                      {it.name}
                    </a>
                  ) : (
                    <span className="font-medium">{it.name}</span>
                  )}
                  {it.sub ? (
                    <span className="shrink-0 text-[11px] text-muted-foreground">
                      {it.sub}
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

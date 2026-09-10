"use client";

import { Eye, EyeOff } from "lucide-react";
import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * v1.2-BC: botão de olho pra ligar/desligar o modo discrição dos valores
 * financeiros. Fonte da verdade = data-hide-money no <html> (persiste entre
 * navegações; volta a "oculto" a cada reload — pedido: sempre começar oculto).
 */
export function MoneyToggle({ className }: { className?: string }) {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    setHidden(document.documentElement.dataset.hideMoney !== "0");
  }, []);

  const toggle = () => {
    const next = !hidden;
    setHidden(next);
    const html = document.documentElement;
    html.dataset.hideMoney = next ? "1" : "0";
    if (next) {
      html
        .querySelectorAll(".gb-money.gb-reveal")
        .forEach((e) => e.classList.remove("gb-reveal"));
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={hidden ? "Mostrar valores" : "Ocultar valores"}
      aria-label={hidden ? "Mostrar valores financeiros" : "Ocultar valores financeiros"}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:bg-accent",
        className,
      )}
    >
      {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
    </button>
  );
}

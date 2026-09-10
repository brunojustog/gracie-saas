"use client";

import { useEffect } from "react";

/**
 * v1.2-BC: montado uma vez no layout raiz. Instala o listener global de
 * "espiar": no modo discrição, clicar num valor borrado (.gb-money) revela só
 * ele. O estado ligado/desligado mora no atributo data-hide-money do <html>
 * (setado sem flash por um script inline no layout).
 */
export function MoneyProvider() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (document.documentElement.dataset.hideMoney !== "1") return;
      const target = e.target as HTMLElement | null;
      const el = target?.closest?.(".gb-money");
      if (el) el.classList.toggle("gb-reveal");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}

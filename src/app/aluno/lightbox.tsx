"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

/**
 * Visualizador de foto em tela cheia com botão de FECHAR (v1.2-W).
 * Antes as fotos abriam via <a target="_blank"> — no PWA standalone isso
 * prendia o usuário numa aba sem barra do navegador. Agora é um overlay
 * interno: toque no X (ou fora da imagem, ou ESC) pra voltar.
 */
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="gb-lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <button className="gb-lightbox-close" onClick={onClose} aria-label="Fechar">
        <X size={22} />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" onClick={(e) => e.stopPropagation()} />
    </div>
  );
}

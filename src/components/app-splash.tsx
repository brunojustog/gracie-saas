"use client";

import { useEffect, useState } from "react";

/**
 * Tela de carregamento (splash) do app — v1.2-Y.
 *
 * Aparece sempre que o app é aberto pelo ícone (carga "dura" da página),
 * cobrindo a tela com a arte da academia até o app terminar de carregar, e
 * some com um fade. Como fica no layout do aluno/professor, monta 1x por
 * abertura — não reaparece na navegação interna (SPA).
 *
 * É a forma que funciona em iPhone e Android por igual: o splash nativo do
 * Android não aceita imagem custom (fica o ícone sobre a cor de fundo) e o do
 * iPhone exige um jogo de imagens por modelo — este overlay resolve os dois.
 */
export function AppSplash() {
  const [hide, setHide] = useState(false);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    // Tempo mínimo pra não "piscar" + espera o load da página.
    const MIN = 700;
    const start = performance.now();
    const dismiss = () => {
      const wait = Math.max(0, MIN - (performance.now() - start));
      setTimeout(() => setHide(true), wait);
    };
    if (document.readyState === "complete") dismiss();
    else window.addEventListener("load", dismiss, { once: true });
    // Trava de segurança: some em no máx. 4s mesmo se o load demorar.
    const safety = setTimeout(() => setHide(true), 4000);
    return () => {
      window.removeEventListener("load", dismiss);
      clearTimeout(safety);
    };
  }, []);

  // Remove do DOM depois do fade (400ms).
  useEffect(() => {
    if (!hide) return;
    const t = setTimeout(() => setGone(true), 450);
    return () => clearTimeout(t);
  }, [hide]);

  if (gone) return null;

  return (
    <div className={`app-splash${hide ? " hide" : ""}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/splash.webp" alt="" fetchPriority="high" decoding="async" />
    </div>
  );
}

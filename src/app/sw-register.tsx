"use client";

import { useEffect } from "react";

/** v1.2-D: registra o service worker do PWA (instalação + base de push). */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* silencioso — não bloqueia o app se o SW falhar */
      });
    }
  }, []);
  return null;
}

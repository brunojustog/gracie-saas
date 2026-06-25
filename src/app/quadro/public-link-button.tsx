"use client";

import { Link2, Copy, RefreshCw, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import { disablePublicQuadroLink, regeneratePublicQuadroLink } from "./actions";

/**
 * Botão (ADMIN) pra gerar/copiar/revogar o link público read-only do Quadro
 * (v1.1-BF). O link não pede login e NÃO mostra números financeiros.
 */
export function PublicLinkButton({ token }: { token: string | null }) {
  const [current, setCurrent] = useState<string | null>(token);
  const [pending, startTransition] = useTransition();

  const url =
    current && typeof window !== "undefined"
      ? `${window.location.origin}/p/quadro/${current}`
      : null;

  const regenerate = () =>
    startTransition(async () => {
      const r = await regeneratePublicQuadroLink();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setCurrent(r.token);
      toast.success(token ? "Link novo gerado (o anterior parou de funcionar)" : "Link público gerado");
    });

  const disable = () =>
    startTransition(async () => {
      await disablePublicQuadroLink();
      setCurrent(null);
      toast.success("Link público desativado");
    });

  const copy = () => {
    if (!url) return;
    navigator.clipboard.writeText(url);
    toast.success("Link copiado");
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8">
          <Link2 className="mr-1 h-3.5 w-3.5" />
          Link público
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="mb-2 text-xs font-semibold">Link público do Quadro</div>
        <p className="mb-3 text-[11px] text-muted-foreground">
          Sem login e sem valores em R$. Quem tiver o link vê. Pode revogar
          gerando um novo a qualquer momento.
        </p>

        {current ? (
          <>
            <div className="flex items-center gap-1">
              <input
                readOnly
                value={url ?? ""}
                onFocus={(e) => e.currentTarget.select()}
                className="h-8 flex-1 rounded border bg-muted/40 px-2 text-[11px]"
              />
              <Button size="icon" variant="ghost" className="h-8 w-8" onClick={copy} title="Copiar">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" className="h-8 flex-1" onClick={regenerate} disabled={pending}>
                <RefreshCw className="mr-1 h-3.5 w-3.5" />
                Gerar novo
              </Button>
              <Button size="sm" variant="outline" className="h-8 flex-1 text-red-700 dark:text-red-300" onClick={disable} disabled={pending}>
                <X className="mr-1 h-3.5 w-3.5" />
                Desativar
              </Button>
            </div>
          </>
        ) : (
          <Button size="sm" className="w-full" onClick={regenerate} disabled={pending}>
            {pending ? "Gerando…" : "Gerar link público"}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

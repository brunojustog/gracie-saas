"use client";

import { CheckCircle2, Loader2, Play, XCircle } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { runImportPage } from "./actions";

type PageSummary = {
  page: number;
  totalInChatwoot: number;
  contactsOnPage: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
  isLastPage: boolean;
};

type State = {
  currentPage: number;
  history: PageSummary[];
  done: boolean;
  totalCreated: number;
  totalUpdated: number;
  totalSkipped: number;
};

const INITIAL: State = {
  currentPage: 1,
  history: [],
  done: false,
  totalCreated: 0,
  totalUpdated: 0,
  totalSkipped: 0,
};

export function ImportRunner() {
  const [state, setState] = useState<State>(INITIAL);
  const [pending, startTransition] = useTransition();

  const handleRun = () => {
    startTransition(async () => {
      const result = await runImportPage({ page: state.currentPage });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const s = result.summary;
      setState((prev) => ({
        currentPage: prev.currentPage + 1,
        history: [...prev.history, s],
        done: s.isLastPage,
        totalCreated: prev.totalCreated + s.created,
        totalUpdated: prev.totalUpdated + s.updated,
        totalSkipped: prev.totalSkipped + s.skipped,
      }));
      if (s.isLastPage) {
        toast.success("Import completo");
      } else {
        toast.success(`Página ${s.page}: ${s.created} novos, ${s.updated} atualizados`);
      }
    });
  };

  const handleReset = () => {
    setState(INITIAL);
  };

  const lastSummary = state.history[state.history.length - 1];
  const totalInChatwoot = lastSummary?.totalInChatwoot ?? null;
  const processedCount =
    state.history.reduce((acc, s) => acc + s.contactsOnPage, 0);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Import histórico do Chatwoot</h2>
        <p className="text-xs text-muted-foreground">
          Puxa contatos antigos do Chatwoot e cria como leads no kanban.
          O stage inicial é definido pelo status da conversa mais recente
          (open → Potencial, pending → Novo Lead, resolved/snoozed → Nutrição).
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          <strong>Não dispara welcome automático</strong> — esses contatos já
          têm conversa em andamento. Cada lead importado recebe a tag
          <code className="mx-1 rounded bg-muted px-1.5 py-0.5">Importado Chatwoot</code>
          + sub-tag conforme status. Idempotente: rodar 2x atualiza sem duplicar.
        </p>
      </div>

      {/* Progresso atual */}
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold">Progresso</h3>
          {totalInChatwoot !== null ? (
            <span className="text-xs text-muted-foreground">
              {processedCount} de {totalInChatwoot} contatos visitados
            </span>
          ) : null}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Criados" value={state.totalCreated} color="text-emerald-600" />
          <Stat label="Atualizados" value={state.totalUpdated} color="text-blue-600" />
          <Stat label="Pulados" value={state.totalSkipped} color="text-amber-600" />
        </div>

        <div className="mt-4 flex gap-2">
          {state.done ? (
            <>
              <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Import completo
              </span>
              <Button variant="outline" size="sm" onClick={handleReset} className="ml-auto">
                Recomeçar
              </Button>
            </>
          ) : (
            <Button onClick={handleRun} disabled={pending} className="w-full">
              {pending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Importando página {state.currentPage}…
                </>
              ) : (
                <>
                  <Play className="mr-1.5 h-4 w-4" />
                  {state.history.length === 0
                    ? "Iniciar import (página 1)"
                    : `Importar próxima página (${state.currentPage})`}
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Histórico por página */}
      {state.history.length > 0 ? (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-semibold">Histórico</h3>
          <div className="mt-2 space-y-1.5">
            {state.history.map((s) => (
              <div
                key={s.page}
                className="flex items-baseline gap-3 rounded border bg-muted/30 px-3 py-2 text-xs"
              >
                <span className="font-mono">#{s.page}</span>
                <span className="flex-1">
                  {s.created > 0 ? <span className="text-emerald-700">+{s.created} novos </span> : null}
                  {s.updated > 0 ? <span className="text-blue-700">{s.updated} atualizados </span> : null}
                  {s.skipped > 0 ? <span className="text-amber-700">{s.skipped} pulados</span> : null}
                  {s.errors.length > 0 ? (
                    <span className="ml-2 inline-flex items-center gap-1 text-destructive">
                      <XCircle className="h-3 w-3" />
                      {s.errors.length} erro(s)
                    </span>
                  ) : null}
                </span>
                <span className="text-muted-foreground">{s.contactsOnPage} contatos</span>
              </div>
            ))}
          </div>

          {/* Erros detalhados, se houver */}
          {state.history.some((s) => s.errors.length > 0) ? (
            <details className="mt-3 text-xs">
              <summary className="cursor-pointer text-muted-foreground">
                Ver erros detalhados
              </summary>
              <div className="mt-2 max-h-48 overflow-y-auto rounded bg-muted/40 p-2 font-mono text-[11px]">
                {state.history.flatMap((s) =>
                  s.errors.map((e, i) => (
                    <div key={`${s.page}-${i}`}>
                      [p{s.page}] {e}
                    </div>
                  )),
                )}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded border bg-muted/20 p-2">
      <div className={`text-xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

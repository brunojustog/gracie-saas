"use client";

import { CheckCircle2, FileText, Loader2, Play, Upload, XCircle } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { runImportFromUpload } from "./actions";

type Summary = {
  mode: "DRY_RUN" | "APPLY";
  aeLines: number;
  matriculasLines: number;
  vendedoras: string[];
  planos: string[];
  leadsConsolidated: number;
  leadsTotal: number;
  enrollmentsPlanned: number;
  stageDistribution: Array<{ stage: string; count: number; exists: boolean }>;
  modalityUsage: Array<{ modality: string; count: number; exists: boolean }>;
  applied?: {
    leadsCreated: number;
    leadsUpdated: number;
    enrollmentsCreated: number;
    enrollmentsSkipped: number;
    leadsSkipped: number;
  };
  warnings: string[];
};

export function ImportRunner() {
  const [aulasFile, setAulasFile] = useState<File | null>(null);
  const [matriculasFile, setMatriculasFile] = useState<File | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [pending, startTransition] = useTransition();
  const aulasRef = useRef<HTMLInputElement>(null);
  const matriculasRef = useRef<HTMLInputElement>(null);

  const ready = aulasFile !== null && matriculasFile !== null;

  const handleRun = (apply: boolean) => {
    if (!ready) return;
    const fd = new FormData();
    fd.set("aulas", aulasFile);
    fd.set("matriculas", matriculasFile);
    fd.set("apply", apply ? "true" : "false");
    startTransition(async () => {
      const result = await runImportFromUpload(fd);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setSummary(result.summary);
      toast.success(
        apply
          ? `Import aplicado: ${result.summary.applied?.leadsCreated ?? 0} criados, ${result.summary.applied?.leadsUpdated ?? 0} atualizados`
          : `Dry-run: ${result.summary.leadsTotal} leads simulados`,
      );
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Importar planilhas (CSV)</h2>
        <p className="text-xs text-muted-foreground">
          Faz upload das 2 planilhas-mãe da academia (aulas experimentais e
          matrículas) e materializa como leads + enrollments no kanban.
          Idempotente: rodar 2x atualiza em vez de duplicar.
          <br />
          <strong>Sempre rode o dry-run primeiro</strong> pra conferir contadores
          e ver se os stages/modalidades referenciados existem.
        </p>
      </div>

      {/* Uploaders */}
      <div className="grid gap-3 rounded-lg border bg-card p-4 md:grid-cols-2">
        <FileSlot
          label="Aulas Experimentais"
          expectedName="aulas-experimentais.csv"
          file={aulasFile}
          inputRef={aulasRef}
          onSelect={setAulasFile}
        />
        <FileSlot
          label="Matrículas"
          expectedName="matriculas.csv"
          file={matriculasFile}
          inputRef={matriculasRef}
          onSelect={setMatriculasFile}
        />
      </div>

      {/* Ações */}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => handleRun(false)}
          disabled={!ready || pending}
          className="flex-1"
        >
          {pending && summary?.mode !== "APPLY" ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-4 w-4" />
          )}
          Dry-run (não grava)
        </Button>
        <Button
          onClick={() => handleRun(true)}
          disabled={!ready || pending || !summary || summary.mode !== "DRY_RUN"}
          className="flex-1"
        >
          {pending && summary?.mode === "APPLY" ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
          )}
          Aplicar import
        </Button>
      </div>
      {summary && summary.mode === "DRY_RUN" ? (
        <p className="text-[11px] text-muted-foreground">
          Confira os números abaixo. Se tudo certo, clique{" "}
          <strong>Aplicar import</strong>.
        </p>
      ) : null}

      {/* Summary */}
      {summary ? <SummaryView summary={summary} /> : null}
    </div>
  );
}

function FileSlot({
  label,
  expectedName,
  file,
  inputRef,
  onSelect,
}: {
  label: string;
  expectedName: string;
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSelect: (f: File | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase">{label}</Label>
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => onSelect(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          className="shrink-0"
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" />
          Selecionar
        </Button>
        <div className="min-w-0 flex-1 truncate text-xs">
          {file ? (
            <span className="flex items-center gap-1.5 text-foreground">
              <FileText className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="truncate">{file.name}</span>
              <span className="shrink-0 text-muted-foreground">
                ({(file.size / 1024).toFixed(0)} KB)
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">
              esperado: <code>{expectedName}</code>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function SummaryView({ summary: s }: { summary: Summary }) {
  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          Resultado{" "}
          <span
            className={
              s.mode === "APPLY"
                ? "ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900"
                : "ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-900"
            }
          >
            {s.mode === "APPLY" ? "APLICADO" : "DRY-RUN"}
          </span>
        </h3>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
        <Stat label="AE lidas" value={s.aeLines} />
        <Stat label="Matrículas lidas" value={s.matriculasLines} />
        <Stat label="Leads consolidados" value={s.leadsTotal} />
        <Stat label="Enrollments" value={s.enrollmentsPlanned} />
      </div>

      {s.applied ? (
        <div className="grid grid-cols-2 gap-2 rounded border bg-emerald-50 p-2 text-xs md:grid-cols-4 dark:bg-emerald-950/40">
          <Stat label="Criados" value={s.applied.leadsCreated} color="text-emerald-700" />
          <Stat label="Atualizados" value={s.applied.leadsUpdated} color="text-blue-700" />
          <Stat label="Matrículas" value={s.applied.enrollmentsCreated} color="text-emerald-700" />
          <Stat
            label="Puladas"
            value={s.applied.enrollmentsSkipped + s.applied.leadsSkipped}
            color="text-amber-700"
          />
        </div>
      ) : null}

      <details className="text-xs" open>
        <summary className="cursor-pointer font-medium">Distribuição por stage</summary>
        <div className="mt-2 space-y-1">
          {s.stageDistribution.map((d) => (
            <div
              key={d.stage}
              className={`flex items-center justify-between rounded px-2 py-1 ${
                d.exists ? "bg-muted/30" : "bg-destructive/10"
              }`}
            >
              <span>{d.stage}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono">{d.count}</span>
                {d.exists ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                ) : (
                  <span className="text-[10px] text-destructive">stage não existe</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </details>

      <details className="text-xs">
        <summary className="cursor-pointer font-medium">Modalidades referenciadas</summary>
        <div className="mt-2 space-y-1">
          {s.modalityUsage.map((d) => (
            <div
              key={d.modality}
              className="flex items-center justify-between rounded bg-muted/30 px-2 py-1"
            >
              <span>{d.modality}</span>
              <span className="flex items-center gap-2">
                <span className="font-mono">{d.count}</span>
                {d.exists ? null : (
                  <span className="text-[10px] text-destructive">não existe</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </details>

      {s.vendedoras.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium">
            Vendedoras detectadas ({s.vendedoras.length})
          </summary>
          <p className="mt-1 text-muted-foreground">{s.vendedoras.join(", ")}</p>
        </details>
      ) : null}

      {s.planos.length > 0 ? (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium">
            Planos detectados ({s.planos.length})
          </summary>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {s.planos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {s.warnings.length > 0 ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-2 text-xs dark:bg-amber-950/40">
          <div className="flex items-center gap-1 font-medium text-amber-900 dark:text-amber-200">
            <XCircle className="h-3.5 w-3.5" />
            Avisos ({s.warnings.length})
          </div>
          <ul className="mt-1 list-disc pl-4 text-amber-800 dark:text-amber-300">
            {s.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Stat({
  label,
  value,
  color = "text-foreground",
}: {
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded border bg-muted/20 p-2">
      <div className={`text-lg font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
    </div>
  );
}

"use client";

import { Award, Camera, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { GradListRow } from "@/server/graduations";

import { graduateAluno } from "../graduar-actions";

const BELTS = [
  "Branca", "Cinza", "Amarela", "Laranja", "Verde",
  "Azul", "Roxa", "Marrom", "Preta",
];

function beltLabel(belt: string | null, grau: number | null) {
  if (!belt) return "sem faixa";
  return `${belt}${grau ? ` ${grau}º` : ""}`;
}

export function GraduarView({ rows }: { rows: GradListRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState<string | null>(null);
  const [q, setQ] = useState("");
  // Estado do formulário aberto.
  const [belt, setBelt] = useState("");
  const [grau, setGrau] = useState("0");
  const [note, setNote] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const openForm = (r: GradListRow) => {
    setOpen(r.alunoId);
    setBelt(r.next?.belt ?? r.belt ?? "");
    setGrau(String(r.next?.beltDegree ?? 0));
    setNote("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = (alunoId: string) => {
    if (!belt) {
      toast.error("Escolha a faixa");
      return;
    }
    const fd = new FormData();
    fd.set("alunoId", alunoId);
    fd.set("belt", belt);
    fd.set("beltDegree", grau);
    if (note) fd.set("note", note);
    const file = fileRef.current?.files?.[0];
    if (file) fd.set("photo", file);
    startTransition(async () => {
      const r = await graduateAluno(fd);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Aluno graduado!");
      setOpen(null);
      router.refresh();
    });
  };

  const filtered = q.trim()
    ? rows.filter((r) => r.nome.toLowerCase().includes(q.toLowerCase()))
    : rows;

  return (
    <main className="mx-auto max-w-2xl space-y-3 px-4 py-4">
      <Input
        placeholder="Buscar aluno…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="h-9"
      />

      {filtered.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum aluno.
        </p>
      ) : (
        filtered.map((r) => (
          <div key={r.alunoId} className="rounded-xl border bg-card p-3">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {r.nome}
                  {r.matricula ? (
                    <span className="ml-1 text-[10px] text-muted-foreground">#{r.matricula}</span>
                  ) : null}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {beltLabel(r.belt, r.beltDegree)} · {r.presencas} presenças desde a última
                  {r.disponivel ? (
                    <span className="ml-1 rounded bg-emerald-100 px-1 font-medium text-emerald-800">
                      graduação disponível
                    </span>
                  ) : null}
                </div>
              </div>
              <Button
                size="sm"
                variant={open === r.alunoId ? "secondary" : "outline"}
                disabled={pending}
                onClick={() => (open === r.alunoId ? setOpen(null) : openForm(r))}
              >
                <Award className="mr-1 h-4 w-4" /> Graduar
              </Button>
            </div>

            {open === r.alunoId ? (
              <div className="mt-3 space-y-2 border-t pt-3">
                {r.next ? (
                  <p className="text-[11px] text-muted-foreground">
                    Sugestão: {r.next.belt} {r.next.beltDegree}º grau
                  </p>
                ) : null}
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs">
                    <span className="mb-0.5 block text-muted-foreground">Faixa</span>
                    <select
                      value={belt}
                      onChange={(e) => setBelt(e.target.value)}
                      disabled={pending}
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    >
                      <option value="">—</option>
                      {BELTS.map((b) => (
                        <option key={b} value={b}>{b}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs">
                    <span className="mb-0.5 block text-muted-foreground">Grau</span>
                    <select
                      value={grau}
                      onChange={(e) => setGrau(e.target.value)}
                      disabled={pending}
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm"
                    >
                      {[0, 1, 2, 3, 4, 5, 6].map((g) => (
                        <option key={g} value={g}>{g}º</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block text-xs">
                  <span className="mb-0.5 block text-muted-foreground">Observação (opcional)</span>
                  <Input value={note} onChange={(e) => setNote(e.target.value)} disabled={pending} />
                </label>
                <label className="block text-xs">
                  <span className="mb-0.5 block text-muted-foreground">
                    <Camera className="mr-1 inline h-3.5 w-3.5" /> Foto do momento (opcional)
                  </span>
                  <Input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    disabled={pending}
                    className="h-9 cursor-pointer"
                  />
                </label>
                <Button size="sm" className="w-full" disabled={pending} onClick={() => submit(r.alunoId)}>
                  Confirmar graduação
                </Button>
              </div>
            ) : null}
          </div>
        ))
      )}

      {pending ? (
        <p className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" /> processando…
        </p>
      ) : null}
    </main>
  );
}

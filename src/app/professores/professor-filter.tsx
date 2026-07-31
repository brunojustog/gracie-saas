"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Prof = { id: string; name: string };

/** Filtro por professor — preserva os params de período na URL. */
export function ProfessorFilter({
  professors,
  current,
}: {
  professors: Prof[];
  current: string | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  const change = (id: string) => {
    const p = new URLSearchParams(sp.toString());
    if (id) p.set("professor", id);
    else p.delete("professor");
    router.push(`/professores?${p.toString()}`);
  };

  return (
    <select
      value={current ?? ""}
      onChange={(e) => change(e.target.value)}
      className="h-9 rounded-md border bg-background px-2 text-sm"
    >
      <option value="">Todos os professores</option>
      {professors.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateAlunoSizes } from "../actions";

/**
 * v1.2-AZ: edicao inline dos tamanhos de kimono e faixa na ficha do aluno.
 * Usado pra logistica de entrega nas graduacoes.
 */
export function SizesEditor({
  alunoId,
  kimonoSize,
  beltSize,
}: {
  alunoId: string;
  kimonoSize: string | null;
  beltSize: string | null;
}) {
  const router = useRouter();
  const [kimono, setKimono] = useState(kimonoSize ?? "");
  const [belt, setBelt] = useState(beltSize ?? "");
  const [pending, startTransition] = useTransition();

  const dirty = kimono !== (kimonoSize ?? "") || belt !== (beltSize ?? "");

  const save = () =>
    startTransition(async () => {
      const r = await updateAlunoSizes({
        alunoId,
        kimonoSize: kimono,
        beltSize: belt,
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Tamanhos salvos");
      router.refresh();
    });

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-1">
        <Label htmlFor="kimonoSize" className="text-xs text-muted-foreground">
          Tamanho do kimono
        </Label>
        <Input
          id="kimonoSize"
          value={kimono}
          onChange={(e) => setKimono(e.target.value)}
          placeholder="ex: A2, M1, F3"
          disabled={pending}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="beltSize" className="text-xs text-muted-foreground">
          Tamanho da faixa
        </Label>
        <Input
          id="beltSize"
          value={belt}
          onChange={(e) => setBelt(e.target.value)}
          placeholder="ex: A3, 3, M2"
          disabled={pending}
        />
      </div>
      {dirty ? (
        <div className="col-span-2">
          <Button size="sm" onClick={save} disabled={pending}>
            {pending ? "Salvando…" : "Salvar tamanhos"}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

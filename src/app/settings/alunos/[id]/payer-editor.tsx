"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { updateAlunoPayer } from "../actions";

/**
 * v1.2-BL: responsável pelo pagamento — nome que a recepção procura no extrato
 * do cartão/PIX (ex.: criança paga pelo pai). Editável na ficha.
 */
export function PayerEditor({
  alunoId,
  payerName,
}: {
  alunoId: string;
  payerName: string | null;
}) {
  const router = useRouter();
  const [value, setValue] = useState(payerName ?? "");
  const [pending, startTransition] = useTransition();

  const dirty = value !== (payerName ?? "");

  const save = () =>
    startTransition(async () => {
      const r = await updateAlunoPayer({ alunoId, payerName: value });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Responsável salvo");
      router.refresh();
    });

  return (
    <div className="flex items-end gap-2">
      <div className="flex-1 space-y-1">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="ex: João da Silva (pai)"
          disabled={pending}
        />
      </div>
      {dirty ? (
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      ) : null}
    </div>
  );
}

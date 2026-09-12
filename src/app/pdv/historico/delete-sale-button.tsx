"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { deleteSale } from "../actions";

/**
 * v1.2-BF: excluir uma venda (ADMIN). Confirma, devolve estoque no servidor e
 * atualiza a lista.
 */
export function DeleteSaleButton({
  saleId,
  label,
}: {
  saleId: string;
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onDelete = () => {
    if (!window.confirm(`Excluir esta venda (${label})? O estoque é devolvido. Não dá pra desfazer.`)) {
      return;
    }
    startTransition(async () => {
      const r = await deleteSale({ saleId });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Venda excluída");
      router.refresh();
    });
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 text-muted-foreground hover:text-destructive"
      onClick={onDelete}
      disabled={pending}
      title="Excluir venda"
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}

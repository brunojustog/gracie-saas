"use client";

import { RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

import { restoreLead } from "./actions";

export function RestoreButton({
  leadId,
  leadName,
}: {
  leadId: string;
  leadName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const handleClick = () => {
    if (
      !window.confirm(
        `Restaurar "${leadName}"? O lead volta pro kanban no estágio em que estava.`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await restoreLead({ leadId });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Lead restaurado");
      router.refresh();
    });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleClick}
      disabled={pending}
      className="h-8"
    >
      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
      {pending ? "Restaurando…" : "Restaurar"}
    </Button>
  );
}

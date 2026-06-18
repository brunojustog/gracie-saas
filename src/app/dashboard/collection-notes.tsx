"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { MessageSquarePlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";

import {
  addCollectionNote,
  getCollectionNotes,
  type CollectionNote,
} from "./collection-actions";

/**
 * Botão por linha de inadimplente: abre um popover com o histórico de
 * cobrança + campo pra registrar uma nova ação. Lazy-load das notas ao abrir.
 */
export function CollectionNotesButton({
  enrollmentId,
  leadName,
}: {
  enrollmentId: string;
  leadName: string;
}) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<CollectionNote[] | null>(null);
  const [body, setBody] = useState("");
  const [pending, startTransition] = useTransition();

  const load = () => {
    getCollectionNotes(enrollmentId).then(setNotes);
  };

  const handleOpenChange = (o: boolean) => {
    setOpen(o);
    if (o && notes === null) load();
  };

  const handleAdd = () => {
    const text = body.trim();
    if (!text) return;
    startTransition(async () => {
      const result = await addCollectionNote({ enrollmentId, body: text });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setBody("");
      toast.success("Cobrança registrada");
      load();
    });
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title="Registrar cobrança / ver histórico"
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          {notes && notes.length > 0 ? notes.length : "cobrança"}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="mb-2 text-xs font-semibold">Cobrança — {leadName}</div>

        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Ex: liguei, sem resposta; mandei pix; prometeu pagar dia 10…"
            disabled={pending}
            className="text-xs"
          />
          <Button
            size="sm"
            className="w-full"
            onClick={handleAdd}
            disabled={pending || !body.trim()}
          >
            {pending ? "Registrando…" : "Registrar ação"}
          </Button>
        </div>

        <div className="mt-3 max-h-56 space-y-2 overflow-y-auto border-t pt-2">
          {notes === null ? (
            <p className="text-[11px] text-muted-foreground">Carregando…</p>
          ) : notes.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              Nenhuma cobrança registrada ainda.
            </p>
          ) : (
            notes.map((n) => (
              <div key={n.id} className="text-[11px]">
                <div className="text-muted-foreground">
                  {format(new Date(n.createdAt), "dd/MM HH:mm", { locale: ptBR })}
                  {n.author ? ` · ${n.author}` : ""}
                </div>
                <div className="whitespace-pre-wrap">{n.body}</div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

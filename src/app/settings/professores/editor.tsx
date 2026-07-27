"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { createProfessor, updateProfessor } from "./actions";

type Professor = { id: string; name: string; active: boolean };

export function ProfessorsEditor({ professors }: { professors: Professor[] }) {
  const [editing, setEditing] = useState<Professor | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Professores</h2>
          <p className="text-xs text-muted-foreground">
            Quem dá as aulas particulares. Usado pra atribuir cada aula a um
            professor e fechar o mês por professor. Inativos somem dos forms
            novos mas preservam o histórico.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Novo professor
        </Button>
      </div>

      {professors.length === 0 ? (
        <p className="rounded-lg border bg-card p-6 text-center text-sm text-muted-foreground">
          Nenhum professor cadastrado ainda.
        </p>
      ) : (
        <ul className="space-y-2">
          {professors.map((p) => (
            <li
              key={p.id}
              className={`flex items-center gap-3 rounded-lg border bg-card p-3 ${
                !p.active ? "opacity-60" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <span className="font-medium">{p.name}</span>
                {!p.active && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    inativo
                  </span>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setEditing(p)}>
                Editar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <ProfessorFormDialog
        professor={editing}
        creating={creating}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    </div>
  );
}

function ProfessorFormDialog({
  professor,
  creating,
  onClose,
}: {
  professor: Professor | null;
  creating: boolean;
  onClose: () => void;
}) {
  const open = creating || professor !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <ProfessorFormBody
            key={professor?.id ?? "new"}
            professor={professor}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ProfessorFormBody({
  professor,
  onClose,
}: {
  professor: Professor | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(professor?.name ?? "");
  const [active, setActive] = useState(professor?.active ?? true);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    startTransition(async () => {
      const result = professor
        ? await updateProfessor({ id: professor.id, name: name.trim(), active })
        : await createProfessor({ name: name.trim() });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(professor ? "Professor atualizado" : "Professor criado");
      onClose();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{professor ? "Editar professor" : "Novo professor"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="prof-name">Nome</Label>
          <Input
            id="prof-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ex: Caue Mandú"
            autoFocus
          />
        </div>
        {professor ? (
          <div className="flex items-center justify-between rounded border p-3">
            <div>
              <Label htmlFor="prof-active">Ativo</Label>
              <p className="text-xs text-muted-foreground">
                Inativos somem dos forms novos mas preservam o histórico.
              </p>
            </div>
            <Switch id="prof-active" checked={active} onCheckedChange={setActive} />
          </div>
        ) : null}
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Cancelar
        </Button>
        <Button onClick={handleSave} disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </DialogFooter>
    </>
  );
}

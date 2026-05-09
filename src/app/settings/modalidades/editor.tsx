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

import { createModality, updateModality } from "./actions";

type Modality = {
  id: string;
  name: string;
  description: string | null;
  ageRange: string | null;
  color: string | null;
  active: boolean;
};

export function ModalitiesEditor({ modalities }: { modalities: Modality[] }) {
  const [editing, setEditing] = useState<Modality | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Modalidades</h2>
          <p className="text-xs text-muted-foreground">
            Tipos de aula que a academia oferece. Modalidades inativas não aparecem
            em forms novos mas continuam visíveis em leads/matrículas históricas.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Nova modalidade
        </Button>
      </div>

      <ul className="space-y-2">
        {modalities.map((m) => (
          <li
            key={m.id}
            className={`flex items-center gap-3 rounded-lg border bg-card p-3 ${
              !m.active && "opacity-60"
            }`}
          >
            <span
              className="h-6 w-6 shrink-0 rounded-md"
              style={{ background: m.color ?? "#6B7280" }}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="font-medium">
                {m.name}
                {!m.active && (
                  <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                    inativa
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {m.ageRange ? <span>idade {m.ageRange} · </span> : null}
                {m.description ?? "(sem descrição)"}
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => setEditing(m)}>
              Editar
            </Button>
          </li>
        ))}
      </ul>

      <ModalityFormDialog
        modality={editing}
        creating={creating}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
      />
    </div>
  );
}

function ModalityFormDialog({
  modality,
  creating,
  onClose,
}: {
  modality: Modality | null;
  creating: boolean;
  onClose: () => void;
}) {
  const open = creating || modality !== null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <ModalityFormBody
            key={modality?.id ?? "new"}
            modality={modality}
            onClose={onClose}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function ModalityFormBody({
  modality,
  onClose,
}: {
  modality: Modality | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(modality?.name ?? "");
  const [description, setDescription] = useState(modality?.description ?? "");
  const [ageRange, setAgeRange] = useState(modality?.ageRange ?? "");
  const [color, setColor] = useState(modality?.color ?? "#6B7280");
  const [active, setActive] = useState(modality?.active ?? true);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    startTransition(async () => {
      const result = modality
        ? await updateModality({
            id: modality.id,
            name: name.trim(),
            description: description.trim() || null,
            ageRange: ageRange.trim() || null,
            color,
            active,
          })
        : await createModality({
            name: name.trim(),
            description: description.trim() || null,
            ageRange: ageRange.trim() || null,
            color,
          });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(modality ? "Modalidade atualizada" : "Modalidade criada");
      onClose();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{modality ? "Editar modalidade" : "Nova modalidade"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="desc">Descrição</Label>
          <Input
            id="desc"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="opcional"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="age">Faixa etária</Label>
            <Input
              id="age"
              value={ageRange}
              onChange={(e) => setAgeRange(e.target.value)}
              placeholder="ex: 4-7, 16+"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="color">Cor (calendário)</Label>
            <Input
              id="color"
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 p-1"
            />
          </div>
        </div>
        {modality ? (
          <div className="flex items-center justify-between rounded border p-3">
            <div>
              <Label htmlFor="active">Ativa</Label>
              <p className="text-xs text-muted-foreground">
                Inativas somem dos forms novos mas preservam histórico.
              </p>
            </div>
            <Switch id="active" checked={active} onCheckedChange={setActive} />
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

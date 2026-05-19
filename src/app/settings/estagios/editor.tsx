"use client";

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus } from "lucide-react";
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

import { reorderStages, upsertStage } from "./actions";

type Stage = {
  id: string;
  name: string;
  color: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
  isScheduling: boolean;
  active: boolean;
};

export function StagesEditor({ stages: initial }: { stages: Stage[] }) {
  const [stages, setStages] = useState(initial);
  const [editing, setEditing] = useState<Stage | null>(null);
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  const open = creating || editing !== null;

  const onDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIdx = stages.findIndex((s) => s.id === event.active.id);
    const newIdx = stages.findIndex((s) => s.id === event.over!.id);
    const next = arrayMove(stages, oldIdx, newIdx);
    setStages(next);

    startTransition(async () => {
      const result = await reorderStages({ ids: next.map((s) => s.id) });
      if (!result.ok) {
        toast.error(result.error);
        setStages(initial);
        return;
      }
      toast.success("Ordem atualizada");
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Estágios do funil</h2>
          <p className="text-xs text-muted-foreground">
            As colunas do kanban. Arraste pra reordenar. Ganho/perdido afetam
            estatísticas (conversão usa <code>isWon</code>).
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <Plus className="mr-1 h-4 w-4" /> Novo estágio
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd}
      >
        <SortableContext
          items={stages.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <ul className="space-y-2">
            {stages.map((s) => (
              <SortableStage key={s.id} stage={s} onEdit={setEditing} />
            ))}
          </ul>
        </SortableContext>
      </DndContext>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setEditing(null);
            setCreating(false);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          {open ? (
            <StageFormBody
              key={editing?.id ?? "new"}
              stage={editing}
              onClose={() => {
                setEditing(null);
                setCreating(false);
              }}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SortableStage({
  stage,
  onEdit,
}: {
  stage: Stage;
  onEdit: (s: Stage) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: stage.id });

  return (
    <li
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={`flex items-center gap-3 rounded-lg border bg-card p-3 ${
        isDragging ? "opacity-50" : ""
      } ${!stage.active && "opacity-60"}`}
    >
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="Arrastar"
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <span
        className="h-5 w-5 shrink-0 rounded-md"
        style={{ background: stage.color }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{stage.name}</span>
          {stage.isWon && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-900">
              ganho
            </span>
          )}
          {stage.isLost && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-900">
              perdido
            </span>
          )}
          {stage.isScheduling && (
            <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-900">
              agendamento
            </span>
          )}
          {!stage.active && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">
              inativo
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground">ordem #{stage.order}</div>
      </div>
      <Button variant="outline" size="sm" onClick={() => onEdit(stage)}>
        Editar
      </Button>
    </li>
  );
}

function StageFormBody({
  stage,
  onClose,
}: {
  stage: Stage | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(stage?.name ?? "");
  const [color, setColor] = useState(stage?.color ?? "#6B7280");
  const [isWon, setIsWon] = useState(stage?.isWon ?? false);
  const [isLost, setIsLost] = useState(stage?.isLost ?? false);
  const [isScheduling, setIsScheduling] = useState(stage?.isScheduling ?? false);
  const [active, setActive] = useState(stage?.active ?? true);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    if (!name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }
    if (isWon && isLost) {
      toast.error("Estágio não pode ser ganho e perdido ao mesmo tempo");
      return;
    }
    startTransition(async () => {
      const result = await upsertStage({
        id: stage?.id,
        name: name.trim(),
        color,
        isWon,
        isLost,
        isScheduling,
        active,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(stage ? "Estágio atualizado" : "Estágio criado");
      onClose();
    });
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{stage ? "Editar estágio" : "Novo estágio"}</DialogTitle>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="name">Nome</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="color">Cor</Label>
          <Input
            id="color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 p-1"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex items-center justify-between rounded border p-2">
            <Label htmlFor="won" className="text-sm">
              Ganho
            </Label>
            <Switch
              id="won"
              checked={isWon}
              onCheckedChange={(v) => {
                setIsWon(v);
                if (v) setIsLost(false);
              }}
            />
          </div>
          <div className="flex items-center justify-between rounded border p-2">
            <Label htmlFor="lost" className="text-sm">
              Perdido
            </Label>
            <Switch
              id="lost"
              checked={isLost}
              onCheckedChange={(v) => {
                setIsLost(v);
                if (v) setIsWon(false);
              }}
            />
          </div>
        </div>
        <div className="flex items-start justify-between rounded border p-3">
          <div>
            <Label htmlFor="scheduling" className="text-sm">
              Estágio de agendamento
            </Label>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Quando arrastar lead pra esse estágio, abre modal de agendar
              aula automaticamente (se lead não tem aula futura).
            </p>
          </div>
          <Switch
            id="scheduling"
            checked={isScheduling}
            onCheckedChange={setIsScheduling}
          />
        </div>
        {stage ? (
          <div className="flex items-center justify-between rounded border p-3">
            <Label htmlFor="active">Ativo</Label>
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

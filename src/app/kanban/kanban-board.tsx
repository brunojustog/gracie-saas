"use client";

import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { cn } from "@/lib/utils";

import { EnrollmentModal } from "../matriculas/enrollment-modal";

import { moveLeadToStage } from "./actions";
import { LeadCard } from "./lead-card";
import { LeadSheet } from "./lead-sheet";

type Lead = React.ComponentProps<typeof LeadCard>["lead"] & {
  stageId: string;
  modalityId: string | null;
  /** Se já tem matrícula, drag pro stage Matriculado NÃO intercepta. */
  enrollment: { id: string; status: string } | null;
};

type Stage = {
  id: string;
  name: string;
  color: string;
  order: number;
  isWon: boolean;
  isLost: boolean;
};

type Modality = { id: string; name: string };
type Seller = { id: string; name: string };

type Props = {
  stages: Stage[];
  leads: Lead[];
  modalities: Modality[];
  sellers: Seller[];
  /** ADMIN/MANAGER pode reatribuir leads e filtrar por vendedora. */
  canReassign: boolean;
};

export function KanbanBoard({
  stages,
  leads: initialLeads,
  modalities,
  sellers,
  canReassign,
}: Props) {
  const router = useRouter();
  const [leads, setLeads] = useState(initialLeads);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [enrollLead, setEnrollLead] = useState<{
    id: string;
    name: string;
    modalityId: string | null;
  } | null>(null);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      // Click sem mover ≥5px NÃO dispara drag, então o click nativo
      // bubble normal e abre o sheet.
      activationConstraint: { distance: 5 },
    }),
  );

  const leadsByStage = useMemo(() => {
    const m = new Map<string, Lead[]>();
    for (const stage of stages) m.set(stage.id, []);
    for (const lead of leads) {
      const arr = m.get(lead.stageId);
      if (arr) arr.push(lead);
    }
    return m;
  }, [stages, leads]);

  const draggingLead = draggingId ? leads.find((l) => l.id === draggingId) : null;

  /** Patch genérico aplicado pelo sheet quando o user salva alguma coisa. */
  const patchLead = useCallback((leadId: string, patch: Partial<Lead>) => {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, ...patch } : l)));
  }, []);

  const onDragStart = (event: DragStartEvent) => {
    setDraggingId(String(event.active.id));
  };

  const onDragEnd = (event: DragEndEvent) => {
    setDraggingId(null);
    const leadId = String(event.active.id);
    const overId = event.over?.id ? String(event.over.id) : null;
    if (!overId) return;

    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === overId) return;

    const targetStage = stages.find((s) => s.id === overId);

    // Interceptação: dragar pro stage isWon (Matriculado) sem ter Enrollment
    // abre modal de matrícula em vez de só mover. NÃO altera estado local
    // ainda — se o user cancelar, o card permanece no stage original.
    if (targetStage?.isWon && !lead.enrollment) {
      setEnrollLead({ id: lead.id, name: lead.name, modalityId: lead.modalityId });
      return;
    }

    const previousStageId = lead.stageId;
    setLeads((prev) =>
      prev.map((l) => (l.id === leadId ? { ...l, stageId: overId } : l)),
    );

    startTransition(async () => {
      const result = await moveLeadToStage({ leadId, toStageId: overId });
      if (!result.ok) {
        setLeads((prev) =>
          prev.map((l) => (l.id === leadId ? { ...l, stageId: previousStageId } : l)),
        );
        toast.error(`Não foi possível mover: ${result.error}`);
        return;
      }
      const stageName = targetStage?.name ?? "estágio";
      toast.success(`${lead.name} movido para ${stageName}`);
    });
  };

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex gap-3 overflow-x-auto pb-4">
          {stages.map((stage) => (
            <StageColumn
              key={stage.id}
              stage={stage}
              leads={leadsByStage.get(stage.id) ?? []}
              onLeadClick={setSelectedLeadId}
            />
          ))}
        </div>
        <DragOverlay>
          {draggingLead ? <LeadCard lead={draggingLead} isOverlay /> : null}
        </DragOverlay>
      </DndContext>

      <LeadSheet
        leadId={selectedLeadId}
        onClose={() => setSelectedLeadId(null)}
        canReassign={canReassign}
        stages={stages}
        modalities={modalities}
        sellers={sellers}
        onLeadPatch={patchLead}
      />

      <EnrollmentModal
        open={enrollLead !== null}
        onOpenChange={(open) => {
          if (!open) setEnrollLead(null);
        }}
        presetLead={enrollLead}
        onCreated={() => {
          setEnrollLead(null);
          // Server action moveu o lead pro stage Matriculado e revalidou
          // o path. Força refresh pra trazer o estado novo.
          router.refresh();
        }}
      />
    </>
  );
}

function StageColumn({
  stage,
  leads,
  onLeadClick,
}: {
  stage: Stage;
  leads: Lead[];
  onLeadClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-72 shrink-0 flex-col rounded-lg border bg-muted/30 transition-colors",
        isOver && "bg-muted/60 ring-2 ring-primary/40",
      )}
    >
      <header className="flex items-center justify-between border-b p-2.5">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ background: stage.color }}
            aria-hidden
          />
          <h2 className="text-sm font-semibold">{stage.name}</h2>
          {stage.isWon && (
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200">
              ganho
            </span>
          )}
          {stage.isLost && (
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-900 dark:bg-red-900/40 dark:text-red-200">
              perdido
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">{leads.length}</span>
      </header>
      <div className="flex flex-1 flex-col gap-2 p-2 min-h-32">
        {leads.length === 0 ? (
          <p className="px-2 py-4 text-center text-xs text-muted-foreground">
            (vazio)
          </p>
        ) : (
          leads.map((lead) => (
            <DraggableCard key={lead.id} lead={lead} onClick={onLeadClick} />
          ))
        )}
      </div>
    </div>
  );
}

function DraggableCard({
  lead,
  onClick,
}: {
  lead: Lead;
  onClick: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: lead.id,
  });

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      onClick={() => onClick(lead.id)}
      className={cn(isDragging && "opacity-30")}
    >
      <LeadCard lead={lead} />
    </div>
  );
}

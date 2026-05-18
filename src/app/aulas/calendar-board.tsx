"use client";

import type { DateSelectArg, EventClickArg, EventInput } from "@fullcalendar/core";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import type { ExperimentalClassStatus } from "@prisma/client";
import { useMemo, useState } from "react";

import { ClassActionsModal } from "./class-actions-modal";
import { ScheduleModal } from "./schedule-modal";
import {
  ScheduleSlotModal,
  type SlotInitial,
} from "./schedule-slot-modal";
import { SlotActionsModal } from "./slot-actions-modal";
import { useRouter } from "next/navigation";

type Modality = { id: string; name: string; color: string | null };
type Lead = { id: string; name: string; phone: string | null; modalityId: string | null };

type ScheduleSlot = {
  id: string;
  dayOfWeek: number;
  startTime: string;
  durationMinutes: number;
  modalityId: string;
  modality: Modality;
};

type CalendarClass = {
  id: string;
  scheduledDate: Date | string;
  status: ExperimentalClassStatus;
  notes: string | null;
  modalityId: string;
  leadId: string;
  modality: Modality;
  lead: {
    id: string;
    name: string;
    phone: string | null;
    assignedSellerId: string | null;
    assignedSeller: { id: string; name: string | null; email: string } | null;
  };
};

type Props = {
  scheduleSlots: ScheduleSlot[];
  initialClasses: CalendarClass[];
  modalities: Modality[];
  leads: Lead[];
};

const DAY_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

type SlotInfo = {
  id: string;
  modalityName: string;
  modalityColor: string | null;
  dayLabel: string;
  startTime: string;
  durationMinutes: number;
  clickedDate: Date;
};

const STATUS_TONE: Record<ExperimentalClassStatus, { bg: string; text: string; border: string }> = {
  SCHEDULED:   { bg: "transparent", text: "inherit", border: "currentColor" },
  CONFIRMED:   { bg: "transparent", text: "inherit", border: "currentColor" },
  ATTENDED:    { bg: "#10B981",     text: "#fff",    border: "#10B981" },
  NO_SHOW:     { bg: "#EF4444",     text: "#fff",    border: "#EF4444" },
  RESCHEDULED: { bg: "transparent", text: "inherit", border: "currentColor" },
  CANCELED:    { bg: "#9CA3AF",     text: "#fff",    border: "#9CA3AF" },
};

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function CalendarBoard({
  scheduleSlots,
  initialClasses,
  modalities,
  leads,
}: Props) {
  const router = useRouter();
  const [classes, setClasses] = useState(initialClasses);
  const [scheduleAt, setScheduleAt] = useState<Date | null>(null);
  const [activeClassId, setActiveClassId] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<SlotInfo | null>(null);
  const [slotEdit, setSlotEdit] = useState<SlotInitial | null>(null);
  const [slotModalOpen, setSlotModalOpen] = useState(false);

  const events = useMemo<EventInput[]>(() => {
    const bgEvents: EventInput[] = scheduleSlots.map((slot) => {
      const [hh, mm] = slot.startTime.split(":").map(Number);
      const startH = String(hh ?? 0).padStart(2, "0");
      const startM = String(mm ?? 0).padStart(2, "0");
      const endTotalMin = (hh ?? 0) * 60 + (mm ?? 0) + slot.durationMinutes;
      const endH = String(Math.floor(endTotalMin / 60)).padStart(2, "0");
      const endM = String(endTotalMin % 60).padStart(2, "0");
      return {
        id: `slot:${slot.id}`,
        daysOfWeek: [slot.dayOfWeek],
        startTime: `${startH}:${startM}`,
        endTime: `${endH}:${endM}`,
        title: slot.modality.name,
        backgroundColor: slot.modality.color ?? "#6B7280",
        borderColor: slot.modality.color ?? "#6B7280",
        display: "background",
        extendedProps: { kind: "slot", slotId: slot.id, modalityId: slot.modalityId },
      };
    });

    const realEvents: EventInput[] = classes.map((cls) => {
      const start = new Date(cls.scheduledDate);
      const end = addMinutes(start, 60);
      const tone = STATUS_TONE[cls.status];
      const modalityColor = cls.modality.color ?? "#6B7280";
      return {
        id: `class:${cls.id}`,
        title: cls.lead.name,
        start: start.toISOString(),
        end: end.toISOString(),
        backgroundColor: tone.bg === "transparent" ? modalityColor : tone.bg,
        borderColor: tone.border === "currentColor" ? modalityColor : tone.border,
        textColor: tone.text === "inherit" ? "#fff" : tone.text,
        extendedProps: {
          kind: "class",
          classId: cls.id,
          status: cls.status,
          modalityName: cls.modality.name,
          leadId: cls.leadId,
          leadName: cls.lead.name,
        },
      };
    });

    return [...bgEvents, ...realEvents];
  }, [scheduleSlots, classes]);

  const onDateSelect = (arg: DateSelectArg) => {
    setScheduleAt(arg.start);
  };

  const onEventClick = (arg: EventClickArg) => {
    const kind = arg.event.extendedProps.kind;
    if (kind === "class") {
      setActiveClassId(arg.event.extendedProps.classId as string);
    } else if (kind === "slot") {
      // Click num slot da grade abre o menu de ações (v1.1-S):
      // agendar aula aqui, editar slot ou remover. O `start` carrega
      // a data específica clicada (não só hora) — usado no "agendar".
      const slotId = arg.event.extendedProps.slotId as string;
      const slot = scheduleSlots.find((s) => s.id === slotId);
      if (slot && arg.event.start) {
        setActiveSlot({
          id: slot.id,
          modalityName: slot.modality.name,
          modalityColor: slot.modality.color,
          dayLabel: DAY_LABEL[slot.dayOfWeek] ?? "?",
          startTime: slot.startTime,
          durationMinutes: slot.durationMinutes,
          clickedDate: arg.event.start,
        });
      }
    }
  };

  const openNewSlotModal = () => {
    setSlotEdit({
      modalityId: modalities[0]?.id ?? "",
      dayOfWeek: 1,
      startTime: "19:00",
      durationMinutes: 60,
    });
    setSlotModalOpen(true);
  };

  const openEditSlotModal = (slotId: string) => {
    const slot = scheduleSlots.find((s) => s.id === slotId);
    if (!slot) return;
    setSlotEdit({
      id: slot.id,
      modalityId: slot.modalityId,
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      durationMinutes: slot.durationMinutes,
    });
    setSlotModalOpen(true);
  };

  const onClassCreated = (cls: CalendarClass) => {
    setClasses((prev) => [...prev, cls]);
  };

  const onClassUpdated = (cls: CalendarClass) => {
    setClasses((prev) => prev.map((c) => (c.id === cls.id ? cls : c)));
  };

  const activeClass = activeClassId ? classes.find((c) => c.id === activeClassId) : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={openNewSlotModal}
          className="rounded-md border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          + Novo horário na grade
        </button>
      </div>
    <div className="rounded-lg border bg-card p-2">
      <FullCalendar
        plugins={[timeGridPlugin, dayGridPlugin, interactionPlugin]}
        initialView="timeGridWeek"
        locale={ptBrLocale}
        firstDay={1}
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
        allDaySlot={false}
        height="auto"
        nowIndicator
        weekends
        events={events}
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "timeGridDay,timeGridWeek,dayGridMonth",
        }}
        buttonText={{
          today: "hoje",
          month: "mês",
          week: "semana",
          day: "dia",
        }}
        selectable
        selectMirror
        select={onDateSelect}
        eventClick={onEventClick}
        eventDisplay="block"
      />

      <ScheduleModal
        open={scheduleAt !== null}
        onOpenChange={(open) => {
          if (!open) setScheduleAt(null);
        }}
        defaultDate={scheduleAt}
        modalities={modalities}
        leads={leads}
        scheduleSlots={scheduleSlots}
        onCreated={(cls) => {
          onClassCreated(cls);
          setScheduleAt(null);
        }}
      />

      <ClassActionsModal
        cls={activeClass ?? null}
        onOpenChange={(open) => {
          if (!open) setActiveClassId(null);
        }}
        onUpdated={(cls) => {
          onClassUpdated(cls);
        }}
      />

      <SlotActionsModal
        slot={activeSlot}
        onClose={() => setActiveSlot(null)}
        onScheduleClass={(date) => {
          setActiveSlot(null);
          setScheduleAt(date);
        }}
        onEditRequest={() => {
          if (!activeSlot) return;
          const id = activeSlot.id;
          setActiveSlot(null);
          openEditSlotModal(id);
        }}
        onDeleted={() => router.refresh()}
      />

      <ScheduleSlotModal
        open={slotModalOpen}
        onOpenChange={setSlotModalOpen}
        initial={slotEdit}
        modalities={modalities}
        onSaved={() => {
          setSlotModalOpen(false);
          router.refresh();
        }}
      />
    </div>
    </div>
  );
}

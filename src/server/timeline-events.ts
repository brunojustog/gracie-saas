/**
 * v1.2-U: eventos da linha do tempo do aluno + merge com as graduações.
 * A linha do tempo do app junta as graduações (do fluxo do professor) com os
 * eventos manuais (campeonato, início, grau, etc.) que a gestão adiciona.
 */
import { format } from "date-fns";

import { prisma } from "@/lib/prisma";

export type TimelineItem = {
  id: string;
  kind: "GRADUACAO" | "GRAU" | "CAMPEONATO" | "INICIO" | "OUTRO";
  title: string;
  subtitle: string | null;
  dateISO: string;
  belt: string | null; // pra colorir a graduação
  photos: string[]; // URLs
};

/** Linha do tempo unificada (graduações + eventos), mais recente primeiro. */
export async function getAlunoTimeline(
  tenantId: string,
  alunoId: string,
): Promise<TimelineItem[]> {
  const [grads, events] = await Promise.all([
    prisma.graduation.findMany({
      where: { tenantId, alunoId },
      orderBy: { graduatedAt: "desc" },
      select: {
        id: true, belt: true, beltDegree: true, graduatedAt: true, note: true,
        photoMime: true, professor: { select: { name: true } },
      },
    }),
    prisma.timelineEvent.findMany({
      where: { tenantId, alunoId },
      orderBy: { eventDate: "desc" },
      select: {
        id: true, kind: true, title: true, eventDate: true, note: true,
        photos: { select: { id: true } },
      },
    }),
  ]);

  const items: TimelineItem[] = [
    ...grads.map((g) => ({
      id: `grad_${g.id}`,
      kind: "GRADUACAO" as const,
      title: `Faixa ${g.belt}${g.beltDegree ? ` · ${g.beltDegree}º grau` : ""}`,
      subtitle: [g.professor?.name, g.note].filter(Boolean).join(" · ") || null,
      dateISO: format(g.graduatedAt, "yyyy-MM-dd"),
      belt: g.belt,
      photos: g.photoMime ? [`/api/aluno/graduation/${g.id}/photo`] : [],
    })),
    ...events.map((e) => ({
      id: `ev_${e.id}`,
      kind: e.kind,
      title: e.title,
      subtitle: e.note,
      dateISO: format(e.eventDate, "yyyy-MM-dd"),
      belt: null,
      photos: e.photos.map((p) => `/api/aluno/event-photo/${p.id}`),
    })),
  ];
  items.sort((a, b) => b.dateISO.localeCompare(a.dateISO));
  return items;
}

export type AdminEvent = {
  id: string;
  kind: "GRADUACAO" | "GRAU" | "CAMPEONATO" | "INICIO" | "OUTRO";
  title: string;
  dateISO: string;
  note: string | null;
  photoIds: string[];
};

/** Eventos manuais de um aluno (pra gestão gerenciar). */
export async function getAlunoEventsAdmin(
  tenantId: string,
  alunoId: string,
): Promise<AdminEvent[]> {
  const events = await prisma.timelineEvent.findMany({
    where: { tenantId, alunoId },
    orderBy: { eventDate: "desc" },
    select: {
      id: true, kind: true, title: true, eventDate: true, note: true,
      photos: { select: { id: true } },
    },
  });
  return events.map((e) => ({
    id: e.id,
    kind: e.kind,
    title: e.title,
    dateISO: format(e.eventDate, "yyyy-MM-dd"),
    note: e.note,
    photoIds: e.photos.map((p) => p.id),
  }));
}

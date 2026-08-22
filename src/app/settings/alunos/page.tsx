import { format } from "date-fns";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import type { AdminEvent } from "./aluno-events";
import { AlunosEditor } from "./editor";

export default async function AlunosSettingsPage() {
  const { tenant } = await requireRole("ADMIN");

  const [alunos, tenantRow] = await Promise.all([
    prisma.aluno.findMany({
      where: { tenantId: tenant.id },
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        matricula: true,
        active: true,
        createdAt: true,
        user: { select: { email: true } },
        lead: {
          select: {
            name: true, phone: true, belt: true, beltDegree: true,
            gender: true, birthDate: true,
          },
        },
      },
    }),
    prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { latitude: true, longitude: true, checkinRadiusMeters: true, showAlunoProgress: true },
    }),
  ]);

  // v1.2-U: eventos da linha do tempo, agrupados por aluno (só metadados).
  const allEvents = await prisma.timelineEvent.findMany({
    where: { tenantId: tenant.id },
    orderBy: { eventDate: "desc" },
    select: {
      id: true, alunoId: true, kind: true, title: true, eventDate: true,
      note: true, photos: { select: { id: true } },
    },
  });
  const eventsByAluno: Record<string, AdminEvent[]> = {};
  for (const e of allEvents) {
    (eventsByAluno[e.alunoId] ??= []).push({
      id: e.id,
      kind: e.kind,
      title: e.title,
      dateISO: format(e.eventDate, "yyyy-MM-dd"),
      note: e.note,
      photoIds: e.photos.map((p) => p.id),
    });
  }

  return (
    <AlunosEditor
      alunos={alunos.map((a) => ({
        id: a.id,
        nome: a.lead.name,
        phone: a.lead.phone,
        email: a.user?.email ?? null,
        matricula: a.matricula,
        belt: a.lead.belt,
        beltDegree: a.lead.beltDegree,
        gender: a.lead.gender,
        birthDateISO: a.lead.birthDate
          ? a.lead.birthDate.toISOString().slice(0, 10)
          : null,
        active: a.active,
        createdAtISO: a.createdAt.toISOString(),
      }))}
      location={{
        latitude: tenantRow?.latitude != null ? Number(tenantRow.latitude) : null,
        longitude: tenantRow?.longitude != null ? Number(tenantRow.longitude) : null,
        radiusMeters: tenantRow?.checkinRadiusMeters ?? 6000,
      }}
      showProgress={tenantRow?.showAlunoProgress ?? true}
      eventsByAluno={eventsByAluno}
    />
  );
}

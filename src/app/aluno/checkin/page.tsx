import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { prisma } from "@/lib/prisma";
import { ageFromBirth, canAttend, nivelLabel, type AlunoProfile } from "@/server/class-eligibility";
import { getAlunoDay } from "@/server/class-sessions";
import { requireAluno } from "@/server/tenant";

import { CheckinView } from "./checkin-view";

type SearchParams = Promise<{ date?: string }>;

export default async function CheckinPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, aluno } = await requireAluno();
  const sp = await searchParams;
  if (!aluno) {
    return (
      <main className="gb-shell" style={{ paddingTop: 60, textAlign: "center" }}>
        <p style={{ color: "var(--muted)" }}>Acesso não vinculado a um aluno.</p>
      </main>
    );
  }

  const selected = sp.date ? new Date(`${sp.date}T12:00:00`) : new Date();

  const [allDay, alunoRow, tenantGeo] = await Promise.all([
    getAlunoDay(tenant.id, aluno.id, selected),
    prisma.aluno.findUnique({
      where: { id: aluno.id },
      select: { lead: { select: { belt: true, beltDegree: true, gender: true, birthDate: true } } },
    }),
    prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { latitude: true, longitude: true },
    }),
  ]);

  const profile: AlunoProfile = {
    belt: alunoRow?.lead.belt ?? null,
    grau: alunoRow?.lead.beltDegree ?? 0,
    age: ageFromBirth(alunoRow?.lead.birthDate ?? null, new Date()),
    gender: alunoRow?.lead.gender ?? null,
  };
  // v1.2-W: mostra TODAS as aulas do dia; o check-in fica liberado só nas que
  // o perfil (faixa/idade/sexo) permite. Cada aula ganha nível + flag.
  const day = allDay.map((s) => ({
    ...s,
    canCheckin: canAttend(profile, s.label),
    nivel: nivelLabel(s.label),
  }));
  const firstName = aluno.name.split(" ")[0] ?? aluno.name;

  return (
    <CheckinView
      dateLabel={format(selected, "EEEE, dd 'de' MMMM", { locale: ptBR })}
      day={day}
      hasGeofence={tenantGeo?.latitude != null && tenantGeo?.longitude != null}
      firstName={firstName}
    />
  );
}

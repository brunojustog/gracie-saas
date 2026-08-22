import {
  eachDayOfInterval,
  endOfWeek,
  format,
  startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";

import { prisma } from "@/lib/prisma";
import { signOut } from "@/server/auth";
import { ageFromBirth, canAttend, type AlunoProfile } from "@/server/class-eligibility";
import { getAlunoDay, getWeekSchedule } from "@/server/class-sessions";
import { getAlunoProgress } from "@/server/graduations";
import { getAlunoTimeline } from "@/server/timeline-events";
import { requireAluno } from "@/server/tenant";

import { AlunoView } from "./aluno-view";

type SearchParams = Promise<{ date?: string }>;

export default async function AlunoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, user, aluno } = await requireAluno();
  const sp = await searchParams;

  const SignOut = (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button type="submit" className="gb-icon-btn" title="Sair" aria-label="Sair">
        {/* ícone de logout inline (sem depender de client) */}
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </form>
  );

  if (!aluno) {
    return (
      <main className="gb-shell" style={{ textAlign: "center", paddingTop: 80 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700 }}>Área do aluno</h1>
        <p style={{ color: "var(--muted)", fontSize: 14, marginTop: 8 }}>
          Seu usuário ({user.email}) ainda não está vinculado a um aluno. Peça
          pra recepção liberar seu acesso.
        </p>
        <div style={{ marginTop: 16, display: "flex", justifyContent: "center" }}>
          {SignOut}
        </div>
      </main>
    );
  }

  const selected = sp.date ? new Date(`${sp.date}T12:00:00`) : new Date();
  const weekStart = startOfWeek(selected, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(selected, { weekStartsOn: 1 });

  const alunoRow = await prisma.aluno.findUnique({
    where: { id: aluno.id },
    select: {
      lastGraduationAt: true,
      photoMime: true,
      lead: {
        select: { belt: true, beltDegree: true, gender: true, birthDate: true },
      },
    },
  });

  const profile: AlunoProfile = {
    belt: alunoRow?.lead.belt ?? null,
    grau: alunoRow?.lead.beltDegree ?? 0,
    age: ageFromBirth(alunoRow?.lead.birthDate ?? null, new Date()),
    gender: alunoRow?.lead.gender ?? null,
  };

  const [day, week, timeline, progress, weekCheckins, tenantGeo] =
    await Promise.all([
      getAlunoDay(tenant.id, aluno.id, selected),
      getWeekSchedule(tenant.id),
      getAlunoTimeline(tenant.id, aluno.id),
      getAlunoProgress(aluno.id, alunoRow?.lastGraduationAt ?? null),
      prisma.checkIn.findMany({
        where: {
          alunoId: aluno.id,
          session: { date: { gte: weekStart, lte: weekEnd } },
        },
        select: { session: { select: { date: true } } },
      }),
      prisma.tenant.findUnique({
        where: { id: tenant.id },
        select: { latitude: true, longitude: true, showAlunoProgress: true },
      }),
    ]);

  // v1.2-J: filtro por perfil — o aluno só vê as aulas que pode fazer.
  const visibleDay = day.filter((s) => canAttend(profile, s.label));

  const trained = new Set(
    weekCheckins.map((c) => format(c.session.date, "yyyy-MM-dd")),
  );
  const DOW = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];
  const todayISO = format(new Date(), "yyyy-MM-dd");
  const selectedISO = format(selected, "yyyy-MM-dd");
  const weekStrip = eachDayOfInterval({ start: weekStart, end: weekEnd }).map(
    (d, i) => {
      const iso = format(d, "yyyy-MM-dd");
      return {
        iso,
        dow: DOW[i],
        num: format(d, "d"),
        trained: trained.has(iso),
        isToday: iso === todayISO,
        isSelected: iso === selectedISO,
      };
    },
  );

  const hasGeofence = tenantGeo?.latitude != null && tenantGeo?.longitude != null;

  return (
    <AlunoView
      alunoId={aluno.id}
      hasPhoto={alunoRow?.photoMime != null}
      alunoName={aluno.name}
      matricula={aluno.matricula}
      belt={alunoRow?.lead.belt ?? null}
      beltDegree={alunoRow?.lead.beltDegree ?? null}
      dateISO={selectedISO}
      dateLabel={format(selected, "EEEE, dd 'de' MMMM", { locale: ptBR })}
      day={visibleDay}
      week={week}
      weekStrip={weekStrip}
      hasGeofence={hasGeofence}
      showProgress={tenantGeo?.showAlunoProgress ?? true}
      progress={progress}
      timeline={timeline}
      tenantName={tenant.name}
      signOutSlot={SignOut}
    />
  );
}

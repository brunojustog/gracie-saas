import { prisma } from "@/lib/prisma";
import { signOut } from "@/server/auth";
import { ageFromBirth, canAttend, nivelLabel, type AlunoProfile } from "@/server/class-eligibility";
import { getWeekSchedule } from "@/server/class-sessions";
import { requireAluno } from "@/server/tenant";

import { GradeView } from "./grade-view";

const DOW = ["", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];

export default async function GradePage() {
  const { tenant, aluno } = await requireAluno();
  if (!aluno) {
    return (
      <main className="gb-shell" style={{ paddingTop: 60, textAlign: "center" }}>
        <p style={{ color: "var(--muted)" }}>Acesso não vinculado a um aluno.</p>
      </main>
    );
  }

  const [week, alunoRow] = await Promise.all([
    getWeekSchedule(tenant.id),
    prisma.aluno.findUnique({
      where: { id: aluno.id },
      select: { lead: { select: { belt: true, beltDegree: true, gender: true, birthDate: true } } },
    }),
  ]);

  const profile: AlunoProfile = {
    belt: alunoRow?.lead.belt ?? null,
    grau: alunoRow?.lead.beltDegree ?? 0,
    age: ageFromBirth(alunoRow?.lead.birthDate ?? null, new Date()),
    gender: alunoRow?.lead.gender ?? null,
  };

  // Grade completa da semana: TODAS as aulas aparecem; a flag `elegivel` diz
  // se aquele perfil pode fazer check-in (só as liberadas pela faixa/idade).
  const days = week
    .filter((d) => d.classes.length > 0)
    .map((d) => ({
      dow: DOW[d.dayOfWeek] ?? "",
      classes: d.classes.map((c) => ({
        startTime: c.startTime,
        label: c.label,
        professorName: c.professorName,
        nivel: nivelLabel(c.label),
        elegivel: canAttend(profile, c.label),
      })),
    }));

  const SignOut = (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button type="submit" className="gb-icon-btn" title="Sair" aria-label="Sair">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
      </button>
    </form>
  );

  return <GradeView days={days} signOutSlot={SignOut} />;
}

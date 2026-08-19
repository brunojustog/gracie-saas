import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/server/auth";
import { getAlunoDay, getWeekSchedule } from "@/server/class-sessions";
import { getAlunoProgress, getAlunoTimeline } from "@/server/graduations";
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
      <Button type="submit" variant="outline" size="sm" className="h-8">
        Sair
      </Button>
    </form>
  );

  if (!aluno) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Área do aluno</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu usuário ({user.email}) ainda não está vinculado a um aluno. Peça
          pra recepção liberar seu acesso.
        </p>
        <div className="mt-4">{SignOut}</div>
      </main>
    );
  }

  const selected = sp.date ? new Date(`${sp.date}T12:00:00`) : new Date();

  const alunoRow = await prisma.aluno.findUnique({
    where: { id: aluno.id },
    select: {
      lastGraduationAt: true,
      lead: { select: { belt: true, beltDegree: true } },
    },
  });

  const [day, week, timeline, progress] = await Promise.all([
    getAlunoDay(tenant.id, aluno.id, selected),
    getWeekSchedule(tenant.id),
    getAlunoTimeline(tenant.id, aluno.id),
    getAlunoProgress(aluno.id, alunoRow?.lastGraduationAt ?? null),
  ]);

  const hasGeofence = await prisma.tenant
    .findUnique({
      where: { id: tenant.id },
      select: { latitude: true, longitude: true },
    })
    .then((t) => t?.latitude != null && t?.longitude != null);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{aluno.name}</div>
            <div className="text-xs text-muted-foreground">
              {tenant.name}
              {aluno.matricula ? ` · matrícula ${aluno.matricula}` : ""}
            </div>
          </div>
          {SignOut}
        </div>
      </header>

      <AlunoView
        alunoName={aluno.name}
        belt={alunoRow?.lead.belt ?? null}
        beltDegree={alunoRow?.lead.beltDegree ?? null}
        dateISO={format(selected, "yyyy-MM-dd")}
        dateLabel={format(selected, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        day={day}
        week={week}
        hasGeofence={hasGeofence}
        progress={progress}
        timeline={timeline.map((t) => ({
          id: t.id,
          belt: t.belt,
          beltDegree: t.beltDegree,
          graduatedAtISO: t.graduatedAt.toISOString(),
          note: t.note,
          professorName: t.professorName,
          hasPhoto: t.hasPhoto,
        }))}
      />
    </div>
  );
}

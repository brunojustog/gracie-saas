import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { getActiveAlunos, getChamadaForDay } from "@/server/class-sessions";
import { getAvailableGraduationAlunoIds } from "@/server/graduations";
import { roleAtLeast } from "@/server/rbac";
import { requireProfessor } from "@/server/tenant";

import { ChamadaView } from "./chamada-view";

type SearchParams = Promise<{ date?: string }>;

export default async function ChamadaPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, membership, professor } = await requireProfessor();
  const sp = await searchParams;
  const isAdmin = roleAtLeast(membership.role, "ADMIN");

  if (!professor && !isAdmin) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Chamada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu usuário não está vinculado a um professor.
        </p>
      </main>
    );
  }

  const selected = sp.date ? new Date(`${sp.date}T12:00:00`) : new Date();
  const [sessions, alunos, gradAvailable] = await Promise.all([
    getChamadaForDay(tenant.id, professor?.id ?? null, selected, isAdmin),
    getActiveAlunos(tenant.id),
    getAvailableGraduationAlunoIds(tenant.id),
  ]);

  return (
    <div>
      <div className="mx-auto max-w-2xl px-4 pt-3">
        <h1 className="text-sm font-semibold">Chamada · presença dos alunos</h1>
      </div>
      <ChamadaView
        dateISO={format(selected, "yyyy-MM-dd")}
        dateLabel={format(selected, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        sessions={sessions}
        alunos={alunos}
        gradAvailable={gradAvailable}
      />
    </div>
  );
}

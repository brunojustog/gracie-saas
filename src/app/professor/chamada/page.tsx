import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";

import { getActiveAlunos, getChamadaForDay } from "@/server/class-sessions";
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
  const [sessions, alunos] = await Promise.all([
    getChamadaForDay(tenant.id, professor?.id ?? null, selected, isAdmin),
    getActiveAlunos(tenant.id),
  ]);

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-semibold">Chamada</div>
            <div className="text-xs text-muted-foreground">
              {tenant.name} · presença dos alunos
            </div>
          </div>
          <Link
            href="/professor"
            className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent"
          >
            Minhas aulas
          </Link>
        </div>
      </header>

      <ChamadaView
        dateISO={format(selected, "yyyy-MM-dd")}
        dateLabel={format(selected, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        sessions={sessions}
        alunos={alunos}
      />
    </div>
  );
}

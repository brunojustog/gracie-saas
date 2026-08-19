import { endOfMonth, format, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { signOut } from "@/server/auth";
import {
  getProfessorCalendar,
  getProfessorDay,
  getProfessorEarnings,
} from "@/server/professor-classes";
import {
  currentCompetencia,
  getProfessorInvoices,
} from "@/server/professor-invoices";
import { requireProfessor } from "@/server/tenant";

import { ProfessorView } from "./professor-view";

type SearchParams = Promise<{ date?: string }>;

export default async function ProfessorPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, user, professor } = await requireProfessor();
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

  if (!professor) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Área do professor</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu usuário ({user.email}) ainda não está vinculado a um professor.
          Peça pro Anderson vincular em Config → Professores.
        </p>
        <div className="mt-4">{SignOut}</div>
      </main>
    );
  }

  // Data selecionada (default hoje). Constrói local pra bater com o fuso SP.
  const selected = sp.date ? new Date(`${sp.date}T12:00:00`) : new Date();
  const day = await getProfessorDay(tenant.id, professor.id, selected);
  const earnings = await getProfessorEarnings(
    tenant.id,
    professor.id,
    startOfMonth(selected),
    endOfMonth(selected),
  );
  const invoices = await getProfessorInvoices(tenant.id, professor.id);
  // v1.1-CK: calendário do mês do próprio professor (aulas dadas por dia).
  const monthStart = startOfMonth(selected);
  const monthEnd = endOfMonth(selected);
  const calendar = await getProfessorCalendar(
    tenant.id,
    professor.id,
    monthStart,
    monthEnd,
  );

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div>
            <div className="text-sm font-semibold">{professor.name}</div>
            <div className="text-xs text-muted-foreground">
              {tenant.name} · minhas aulas
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/professor/chamada"
              className="inline-flex h-8 items-center rounded-md border px-3 text-sm font-medium hover:bg-accent"
            >
              Chamada
            </Link>
            {SignOut}
          </div>
        </div>
      </header>

      <ProfessorView
        professorName={professor.name}
        dateISO={format(selected, "yyyy-MM-dd")}
        dateLabel={format(selected, "EEEE, dd 'de' MMMM", { locale: ptBR })}
        day={day}
        monthLabel={format(selected, "MMMM", { locale: ptBR })}
        earnings={earnings}
        invoices={invoices.map((i) => ({
          id: i.id,
          competencia: i.competencia,
          fileName: i.fileName,
          size: i.size,
          uploadedAtISO: i.uploadedAt.toISOString(),
        }))}
        invoiceCompetencia={currentCompetencia(selected)}
        calendar={{
          byDay: calendar.byDay,
          fromISO: monthStart.toISOString(),
          toISO: monthEnd.toISOString(),
          totalCount: calendar.totalCount,
        }}
      />
    </div>
  );
}

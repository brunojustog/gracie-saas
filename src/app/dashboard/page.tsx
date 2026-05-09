import { auth, signOut } from "@/server/auth";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const session = await auth();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">
            Logado como{" "}
            <span className="font-medium text-foreground">
              {session?.user?.email ?? "—"}
            </span>
          </p>
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <Button type="submit" variant="outline" size="sm">
            Sair
          </Button>
        </form>
      </header>

      <section className="rounded-lg border bg-card p-6">
        <h2 className="font-semibold">Fase 1 concluída</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Setup do projeto pronto: Next.js + Prisma + Auth.js v5 + shadcn/ui +
          Postgres via Docker. Multi-tenancy, kanban, calendário e demais
          features virão nas próximas fases.
        </p>
      </section>
    </main>
  );
}

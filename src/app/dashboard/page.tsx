import { Button } from "@/components/ui/button";
import { signOut } from "@/server/auth";
import { requireTenantUser } from "@/server/tenant";

export default async function DashboardPage() {
  const { tenant, user, membership } = await requireTenantUser();

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            className="h-10 w-10 rounded-md"
            style={{ background: tenant.primaryColor }}
            aria-hidden
          />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{tenant.name}</h1>
            <p className="text-sm text-muted-foreground">
              {user.email}
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {membership.role.toLowerCase()}
              </span>
              {user.isSuperAdmin ? (
                <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                  super
                </span>
              ) : null}
            </p>
          </div>
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

      <section className="grid gap-3 sm:grid-cols-2">
        <a
          href="/kanban"
          className="rounded-lg border bg-card p-6 transition-colors hover:bg-accent"
        >
          <h2 className="font-semibold">Funil comercial</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Kanban dos leads por estágio. Arraste pra mover, filtre por vendedora,
            modalidade, ou busque por nome/telefone.
          </p>
        </a>
        <div className="rounded-lg border border-dashed bg-muted/30 p-6 text-sm text-muted-foreground">
          <h2 className="font-semibold text-foreground">Em breve</h2>
          <p className="mt-1">
            Calendário de aulas experimentais (fase 8), matrículas (fase 9),
            KPIs e gráficos (fase 10).
          </p>
        </div>
      </section>
    </main>
  );
}

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

      <section className="rounded-lg border bg-card p-6">
        <h2 className="font-semibold">Fase 3 ativa: multi-tenancy</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Você está no tenant <span className="font-medium text-foreground">{tenant.slug}</span>
          {" "}via subdomínio. As próximas fases (kanban, calendário, dashboard de KPIs) já
          herdam essa segregação automaticamente — toda query do servidor vai
          filtrar por <code className="rounded bg-muted px-1 py-0.5 text-xs">tenantId</code>{" "}
          via os helpers em <code className="rounded bg-muted px-1 py-0.5 text-xs">src/server/tenant.ts</code>.
        </p>
      </section>
    </main>
  );
}

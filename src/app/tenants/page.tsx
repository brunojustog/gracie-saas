import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { buildAdminUrl, buildTenantUrl } from "@/lib/tenant-url";
import { auth, signOut } from "@/server/auth";

export default async function TenantsPickerPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      tenants: {
        where: { active: true },
        include: { tenant: true },
      },
    },
  });
  if (!user) redirect("/login");

  // Super-admin enxerga todos os tenants ativos.
  const visibleTenants = user.isSuperAdmin
    ? await prisma.tenant.findMany({
        where: { active: true },
        orderBy: { name: "asc" },
      })
    : user.tenants
        .filter((m) => m.tenant.active)
        .map((m) => m.tenant)
        .sort((a, b) => a.name.localeCompare(b.name));

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto");

  // Se o user tem exatamente 1 tenant e não é super-admin, redireciona direto
  // pra evitar tela inútil.
  if (!user.isSuperAdmin && visibleTenants.length === 1) {
    redirect(buildTenantUrl({ slug: visibleTenants[0]!.slug, host, forwardedProto: proto }));
  }

  return (
    <main className="mx-auto max-w-2xl space-y-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Escolher academia</h1>
          <p className="text-sm text-muted-foreground">
            Logado como{" "}
            <span className="font-medium text-foreground">{user.email}</span>
            {user.isSuperAdmin ? (
              <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                super-admin
              </span>
            ) : null}
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

      {visibleTenants.length === 0 ? (
        <section className="rounded-lg border bg-card p-6 text-sm text-muted-foreground">
          Você ainda não tem acesso a nenhuma academia. Peça pro administrador
          adicionar você como membro.
        </section>
      ) : (
        <ul className="space-y-2">
          {visibleTenants.map((t) => (
            <li key={t.id}>
              <Link
                href={buildTenantUrl({ slug: t.slug, host, forwardedProto: proto })}
                className="flex items-center justify-between rounded-lg border bg-card p-4 transition-colors hover:bg-accent"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="h-8 w-8 rounded-md"
                    style={{ background: t.primaryColor }}
                    aria-hidden
                  />
                  <div>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.slug}</div>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">→</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {user.isSuperAdmin ? (
        <section className="rounded-lg border border-dashed bg-muted/30 p-4">
          <p className="text-sm">
            Como super-admin você também tem o painel agregado:
          </p>
          <Link
            href={buildAdminUrl({ host, forwardedProto: proto })}
            className="mt-2 inline-block text-sm font-medium text-primary hover:underline"
          >
            Abrir admin.{host.split(":")[0]} →
          </Link>
        </section>
      ) : null}
    </main>
  );
}

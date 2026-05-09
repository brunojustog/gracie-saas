import { headers } from "next/headers";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { buildTenantUrl } from "@/lib/tenant-url";
import { signOut } from "@/server/auth";
import { requireSuperAdmin } from "@/server/tenant";

export default async function AdminPage() {
  const { user } = await requireSuperAdmin();

  const tenants = await prisma.tenant.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: { users: true, leads: true, enrollments: true },
      },
    },
  });

  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto");

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Painel super-admin</h1>
          <p className="text-sm text-muted-foreground">
            {user.email} — visão agregada de todos os tenants
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

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Tenants ({tenants.length})
        </h2>
        <ul className="space-y-2">
          {tenants.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded-lg border bg-card p-4"
            >
              <div className="flex items-center gap-3">
                <span
                  className="h-8 w-8 rounded-md"
                  style={{ background: t.primaryColor }}
                  aria-hidden
                />
                <div>
                  <div className="font-medium">
                    {t.name}{" "}
                    {!t.active && (
                      <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-xs">
                        inativo
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">{t.slug}</div>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm">
                <div className="text-right">
                  <div className="text-muted-foreground">users</div>
                  <div className="font-medium">{t._count.users}</div>
                </div>
                <div className="text-right">
                  <div className="text-muted-foreground">leads</div>
                  <div className="font-medium">{t._count.leads}</div>
                </div>
                <div className="text-right">
                  <div className="text-muted-foreground">matrículas</div>
                  <div className="font-medium">{t._count.enrollments}</div>
                </div>
                <Link
                  href={buildTenantUrl({ slug: t.slug, host, forwardedProto: proto })}
                  className="text-sm font-medium text-primary hover:underline"
                >
                  abrir →
                </Link>
              </div>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

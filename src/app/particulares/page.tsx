import type { PrivatePackageStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";
import { signOut } from "@/server/auth";
import { getPrivatePackagesForList } from "@/server/private-packages";
import { requireTenantUser } from "@/server/tenant";

import { getPrivateFormOptions } from "./actions";
import { PackagesTable } from "./packages-table";
import { PrivateToolbar } from "./toolbar";

type SearchParams = Promise<{ q?: string; status?: string }>;

const VALID_STATUS: PrivatePackageStatus[] = ["ACTIVE", "COMPLETED", "CANCELED"];

export default async function ParticularesPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, membership, user } = await requireTenantUser();
  const sp = await searchParams;
  const isSeller = membership.role === "SELLER";

  // Filtro multi-seleção (v1.1-AX): status como CSV.
  const statuses = (sp.status ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is PrivatePackageStatus =>
      VALID_STATUS.includes(s as PrivatePackageStatus),
    );

  const [rows, options] = await Promise.all([
    getPrivatePackagesForList(membership, { statuses, search: sp.q }),
    getPrivateFormOptions(),
  ]);

  const active = rows.filter((r) => r.status === "ACTIVE").length;
  const completed = rows.filter((r) => r.status === "COMPLETED").length;
  // Receita só pra ADMIN/MANAGER (value vem null pra SELLER).
  const revenue = rows.reduce((sum, r) => sum + Number(r.value ?? 0), 0);

  return (
    <>
      <TopNav
        tenantName={tenant.name}
        tenantColor={tenant.primaryColor}
        userEmail={user.email}
        role={membership.role}
        signOutSlot={
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
        }
      />
      <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Aulas particulares</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {rows.length} pacote{rows.length === 1 ? "" : "s"}
          </span>
        </div>

        <section className={`grid gap-3 ${isSeller ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs uppercase text-muted-foreground">Em andamento</div>
            <div className="mt-1 text-2xl font-semibold">{active}</div>
          </div>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs uppercase text-muted-foreground">Concluídos</div>
            <div className="mt-1 text-2xl font-semibold">{completed}</div>
          </div>
          {isSeller ? null : (
            <div className="rounded-lg border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">
                Receita (filtro atual)
              </div>
              <div className="mt-1 text-2xl font-semibold">
                {revenue.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
            </div>
          )}
        </section>

        <PrivateToolbar
          options={options}
          initial={{ q: sp.q, statuses }}
        />

        <PackagesTable rows={rows} options={options} hideFinancials={isSeller} />
      </main>
    </>
  );
}

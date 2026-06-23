import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";
import { signOut } from "@/server/auth";
import { getLooseClassesForList } from "@/server/loose-classes";
import { requireTenantUser } from "@/server/tenant";

import { getLooseFormOptions } from "./actions";
import { LooseTable } from "./loose-table";
import { LooseToolbar } from "./toolbar";

type SearchParams = Promise<{ q?: string }>;

export default async function AvulsasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, membership, user } = await requireTenantUser();
  const sp = await searchParams;
  const isSeller = membership.role === "SELLER";

  const [rows, options] = await Promise.all([
    getLooseClassesForList(membership, { search: sp.q }),
    getLooseFormOptions(),
  ]);

  const total = rows.reduce((sum, r) => sum + Number(r.value ?? 0), 0);

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
          <h1 className="text-lg font-semibold tracking-tight">Aulas avulsas</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {rows.length} aula{rows.length === 1 ? "" : "s"}
          </span>
        </div>

        <section className={`grid gap-3 ${isSeller ? "sm:grid-cols-1" : "sm:grid-cols-2"}`}>
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs uppercase text-muted-foreground">Aulas (filtro atual)</div>
            <div className="mt-1 text-2xl font-semibold">{rows.length}</div>
          </div>
          {isSeller ? null : (
            <div className="rounded-lg border bg-card p-4">
              <div className="text-xs uppercase text-muted-foreground">
                Receita (filtro atual)
              </div>
              <div className="mt-1 text-2xl font-semibold">
                {total.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </div>
            </div>
          )}
        </section>

        <LooseToolbar options={options} hideFinancials={isSeller} initial={{ q: sp.q }} />

        <LooseTable rows={rows} hideFinancials={isSeller} />
      </main>
    </>
  );
}

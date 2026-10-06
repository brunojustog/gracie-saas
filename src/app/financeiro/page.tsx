import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";
import { signOut } from "@/server/auth";
import { getFinancialOverview } from "@/server/financial";
import { requireRole } from "@/server/tenant";

import { FinanceiroView } from "./financeiro-view";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ month?: string }>;

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  // Tela de gestão: ADM/gerente (vendedora não vê controle financeiro).
  const { tenant, user, membership } = await requireRole("MANAGER");
  const sp = await searchParams;

  const overview = await getFinancialOverview(membership, sp.month);

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
      <main className="mx-auto max-w-[1100px] space-y-4 px-4 py-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Controle financeiro</h1>
          <p className="text-sm text-muted-foreground">
            Previsto × recebido do mês e situação de cada mensalidade. A baixa
            de pagamento é feita em Matrículas.
          </p>
        </div>
        <FinanceiroView overview={overview} />
      </main>
    </>
  );
}

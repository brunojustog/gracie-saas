import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";
import { signOut } from "@/server/auth";
import { getPurchasesForTenant, getVariantsForPurchase } from "@/server/purchases";
import { requireRole } from "@/server/tenant";

import { ComprasClient } from "./compras-client";

export const dynamic = "force-dynamic";

export default async function ComprasPage() {
  // Custo é dado de gestão — ADM/gerente.
  const { tenant, user, membership } = await requireRole("MANAGER");

  const [purchases, variants] = await Promise.all([
    getPurchasesForTenant(tenant.id),
    getVariantsForPurchase(tenant.id),
  ]);

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
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <Link href="/pdv" className="text-sm text-muted-foreground hover:underline">
              ← Lojinha
            </Link>
            <h1 className="text-lg font-semibold tracking-tight">Compras da lojinha</h1>
            <p className="text-sm text-muted-foreground">
              Lance o que a academia comprou: soma ao estoque e registra o custo
              (controle de gasto × margem). Produto novo? Cadastre antes em{" "}
              <Link href="/pdv/produtos" className="font-medium text-primary hover:underline">
                Produtos
              </Link>
              .
            </p>
          </div>
        </div>
        <ComprasClient purchases={purchases} variants={variants} />
      </main>
    </>
  );
}

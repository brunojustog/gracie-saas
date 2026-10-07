import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";
import { signOut } from "@/server/auth";
import {
  getPurchasesForTenant,
  getSupplyExpensesForTenant,
  getVariantsForPurchase,
} from "@/server/purchases";
import { requireRole } from "@/server/tenant";

import { ComprasTabs } from "./compras-tabs";

export const dynamic = "force-dynamic";

export default async function ComprasPage() {
  // Custo é dado de gestão — ADM/gerente (Gisele).
  const { tenant, user, membership } = await requireRole("MANAGER");

  const [purchases, variants, supplies] = await Promise.all([
    getPurchasesForTenant(tenant.id),
    getVariantsForPurchase(tenant.id),
    getSupplyExpensesForTenant(tenant.id),
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
            <h1 className="text-lg font-semibold tracking-tight">Compras</h1>
            <p className="text-sm text-muted-foreground">
              Compras da lojinha (geram estoque/venda) e insumos da academia
              (despesas). Acesso restrito a administração.
            </p>
          </div>
        </div>
        <ComprasTabs purchases={purchases} variants={variants} supplies={supplies} />
      </main>
    </>
  );
}

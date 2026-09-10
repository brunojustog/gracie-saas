import Link from "next/link";

import { Button } from "@/components/ui/button";
import { signOut } from "@/server/auth";
import { getOrdersForTenant } from "@/server/orders";
import { requireTenantUser } from "@/server/tenant";

import { EncomendasClient } from "./encomendas-client";

export default async function EncomendasPage() {
  const { tenant, user, membership } = await requireTenantUser();
  const orders = await getOrdersForTenant(tenant.id);

  return (
    <main className="mx-auto max-w-[1100px] space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/pdv" className="text-sm text-muted-foreground hover:underline">
            ← PDV
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Encomendas</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {user.email} · {membership.role.toLowerCase()} · {tenant.name}
          </span>
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
        </div>
      </header>

      <p className="text-sm text-muted-foreground">
        Itens que o aluno pediu e não têm em estoque. Registro pra a Gisele
        controlar — não mexe no estoque nem gera venda. Quando o item chegar,
        marque como entregue e feche a venda normal na lojinha.
      </p>

      <EncomendasClient orders={orders} />
    </main>
  );
}

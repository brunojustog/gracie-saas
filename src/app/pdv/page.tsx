import Link from "next/link";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/server/auth";
import { getProductsForTenant } from "@/server/pdv";
import { requireTenantUser } from "@/server/tenant";

import { PdvClient } from "./pdv-client";

export default async function PdvPage() {
  const { tenant, user, membership } = await requireTenantUser();

  const [products, leads] = await Promise.all([
    getProductsForTenant(tenant.id, { onlyActive: true }),
    prisma.lead.findMany({
      where: {
        tenantId: tenant.id,
        ...(membership.role === "SELLER"
          ? { assignedSellerId: membership.userId }
          : {}),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      take: 500,
    }),
  ]);

  // Só mostra produtos que têm pelo menos 1 variant ativa
  const usable = products.filter((p) => p.variants.length > 0 && p.active);

  return (
    <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {tenant.name}
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Lojinha · PDV</h1>
        </div>
        <div className="flex items-center gap-2">
          {membership.role !== "SELLER" ? (
            <Link href="/pdv/produtos">
              <Button variant="outline" size="sm">
                Produtos
              </Button>
            </Link>
          ) : null}
          <Link href="/pdv/historico">
            <Button variant="outline" size="sm">
              Histórico
            </Button>
          </Link>
          <span className="text-xs text-muted-foreground">
            {user.email} · {membership.role.toLowerCase()}
          </span>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="ghost" size="sm">
              Sair
            </Button>
          </form>
        </div>
      </header>

      <PdvClient products={usable} leads={leads} />
    </main>
  );
}

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { signOut } from "@/server/auth";
import { getProductsForTenant } from "@/server/pdv";
import { requireRole } from "@/server/tenant";

import { ProductsManager } from "./products-manager";

export default async function PdvProductsPage() {
  const { tenant, user, membership } = await requireRole("MANAGER");
  const products = await getProductsForTenant(tenant.id);

  return (
    <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/pdv"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← PDV
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Produtos</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {products.length} cadastrados
          </span>
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

      <ProductsManager products={products} />
    </main>
  );
}

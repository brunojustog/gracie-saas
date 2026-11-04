import Link from "next/link";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/server/auth";
import { getOrdersForTenant } from "@/server/orders";
import { getProductsForTenant } from "@/server/pdv";
import { requireTenantUser } from "@/server/tenant";

import { EncomendasClient } from "./encomendas-client";

export default async function EncomendasPage() {
  const { tenant, user, membership } = await requireTenantUser();
  const [orders, leadRows, products] = await Promise.all([
    getOrdersForTenant(tenant.id),
    // v1.2-CC: alunos do tenant pra vincular a encomenda (débito vai na ficha).
    prisma.lead.findMany({
      where: { tenantId: tenant.id, deletedAt: null, aluno: { isNot: null } },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
      take: 2000,
    }),
    // v1.2-CJ: catálogo pra vincular a encomenda a um produto do estoque.
    getProductsForTenant(tenant.id, { onlyActive: true }),
  ]);
  const leads = leadRows.map((l) => ({ id: l.id, name: l.name, phone: l.phone }));
  // Variantes selecionáveis (achatadas): "Produto · Variante (estoque N)".
  const variants = products.flatMap((p) =>
    p.variants.map((v) => ({
      id: v.id,
      label:
        `${p.name} · ${v.label}` +
        (v.stock != null ? ` (estoque ${v.stock})` : " (ilimitado)"),
    })),
  );

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
        Itens que o aluno pediu. Registro pra a Gisele controlar. Se vincular um
        produto do estoque, ao marcar <b>Entregue</b> a quantidade sai do estoque
        automaticamente (sair de &quot;Entregue&quot; devolve). Itens sem produto
        vinculado seguem como texto livre, sem baixa.
      </p>

      <EncomendasClient orders={orders} leads={leads} variants={variants} />
    </main>
  );
}

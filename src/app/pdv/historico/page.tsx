import type { SalePaymentMethod } from "@prisma/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/server/auth";
import { getSalesForList } from "@/server/pdv";
import { requireTenantUser } from "@/server/tenant";

import { HistoricoToolbar } from "./toolbar";

type SearchParams = Promise<{
  from?: string;
  to?: string;
  seller?: string;
  payment?: SalePaymentMethod;
}>;

const PAYMENT_LABEL: Record<SalePaymentMethod, string> = {
  PIX: "Pix",
  DINHEIRO: "Dinheiro",
  CARTAO_DEBITO: "Débito",
  CARTAO_CREDITO: "Crédito",
  CORTESIA: "Cortesia",
  OUTRO: "Outro",
};

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function parseDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export default async function HistoricoPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, user, membership } = await requireTenantUser();
  const sp = await searchParams;

  const from = parseDate(sp.from);
  const to = parseDate(sp.to);
  // Inclui o dia inteiro do "to"
  if (to) to.setHours(23, 59, 59, 999);

  const filters = {
    from,
    to,
    sellerUserId: sp.seller,
    paymentMethod: sp.payment,
  };

  const [sales, sellers] = await Promise.all([
    getSalesForList(membership, filters),
    membership.role === "SELLER"
      ? Promise.resolve([])
      : prisma.user.findMany({
          where: {
            tenants: {
              some: { tenantId: tenant.id, active: true },
            },
          },
          orderBy: { name: "asc" },
          select: { id: true, name: true, email: true },
        }),
  ]);

  const total = sales.reduce((s, r) => s + r.total, 0);

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
          <h1 className="text-xl font-semibold tracking-tight">
            Histórico de vendas
          </h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {sales.length} no período · {fmtBRL(total)}
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

      <HistoricoToolbar
        sellers={sellers}
        initial={{
          from: sp.from,
          to: sp.to,
          seller: sp.seller,
          payment: sp.payment,
        }}
        canFilterSeller={membership.role !== "SELLER"}
      />

      {sales.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nenhuma venda encontrada com esses filtros.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3">Data</th>
                <th className="p-3">Itens</th>
                <th className="p-3">Vendedora</th>
                <th className="p-3">Aluno</th>
                <th className="p-3">Pagamento</th>
                <th className="p-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sales.map((s) => (
                <tr key={s.id} className="align-top">
                  <td className="p-3 text-xs">
                    {format(new Date(s.paidAt), "dd/MM/yyyy HH:mm", {
                      locale: ptBR,
                    })}
                  </td>
                  <td className="p-3">
                    <ul className="space-y-0.5 text-xs">
                      {s.items.map((i) => (
                        <li key={i.id}>
                          {i.quantity}× {i.productVariant.product.name}
                          {i.productVariant.label !== "Padrão"
                            ? ` (${i.productVariant.label})`
                            : ""}{" "}
                          <span className="text-muted-foreground">
                            · {fmtBRL(i.subtotal)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {s.notes ? (
                      <div className="mt-1 text-xs italic text-muted-foreground">
                        “{s.notes}”
                      </div>
                    ) : null}
                  </td>
                  <td className="p-3 text-xs">
                    {s.sellerUser.name ?? s.sellerUser.email}
                  </td>
                  <td className="p-3 text-xs">
                    {s.customerLead ? (
                      <Link
                        href={`/kanban?lead=${s.customerLead.id}`}
                        className="hover:underline"
                      >
                        {s.customerLead.name}
                      </Link>
                    ) : (
                      <span className="text-muted-foreground">avulsa</span>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {PAYMENT_LABEL[s.paymentMethod]}
                  </td>
                  <td className="p-3 text-right font-semibold">
                    {fmtBRL(s.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

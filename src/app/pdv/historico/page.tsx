import type { SalePaymentMethod } from "@prisma/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Money } from "@/components/money";
import { MoneyToggle } from "@/components/money-toggle";
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
  customer?: string;
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
    customerSearch: sp.customer,
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

  // v1.2-BA: resumo por forma de pagamento pro relatorio diario (o que o Junior
  // precisa). Os itens por venda ja aparecem na tabela abaixo.
  const byPayment = sales.reduce<Record<string, { count: number; total: number }>>(
    (acc, s) => {
      const k = s.paymentMethod;
      acc[k] = acc[k] ?? { count: 0, total: 0 };
      acc[k].count += 1;
      acc[k].total += s.total;
      return acc;
    },
    {},
  );

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
            {sales.length} no período · <Money value={total} />
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {user.email} · {membership.role.toLowerCase()} · {tenant.name}
          </span>
          <MoneyToggle />
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
          customer: sp.customer,
        }}
        canFilterSeller={membership.role !== "SELLER"}
      />

      {sales.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <div className="rounded-lg border bg-card px-3 py-2">
            <div className="text-[11px] uppercase text-muted-foreground">Total do período</div>
            <div className="text-lg font-bold"><Money value={total} /></div>
            <div className="text-[11px] text-muted-foreground">{sales.length} venda{sales.length === 1 ? "" : "s"}</div>
          </div>
          {Object.entries(byPayment)
            .sort((a, b) => b[1].total - a[1].total)
            .map(([method, agg]) => (
              <div key={method} className="rounded-lg border bg-card px-3 py-2">
                <div className="text-[11px] uppercase text-muted-foreground">
                  {PAYMENT_LABEL[method as SalePaymentMethod]}
                </div>
                <div className="text-lg font-bold"><Money value={agg.total} /></div>
                <div className="text-[11px] text-muted-foreground">
                  {agg.count} venda{agg.count === 1 ? "" : "s"}
                </div>
              </div>
            ))}
        </div>
      ) : null}

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
                            · <Money value={i.subtotal} />
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
                    ) : s.customerName ? (
                      <span>{s.customerName}</span>
                    ) : (
                      <span className="text-muted-foreground">avulsa</span>
                    )}
                  </td>
                  <td className="p-3 text-xs">
                    {PAYMENT_LABEL[s.paymentMethod]}
                    {s.discount > 0 ? (
                      <span className="ml-1 text-emerald-600 dark:text-emerald-400">−5%</span>
                    ) : null}
                  </td>
                  <td className="p-3 text-right font-semibold">
                    <Money value={s.total} />
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

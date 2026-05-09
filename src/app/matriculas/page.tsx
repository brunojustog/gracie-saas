import type { EnrollmentStatus } from "@prisma/client";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/server/auth";
import { getEnrollmentsForList } from "@/server/enrollments";
import { requireTenantUser } from "@/server/tenant";

import { EnrollmentsTable } from "./enrollments-table";
import { EnrollmentsToolbar } from "./toolbar";

type SearchParams = Promise<{
  q?: string;
  modality?: string;
  status?: EnrollmentStatus;
}>;

export default async function MatriculasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, membership, user } = await requireTenantUser();
  const sp = await searchParams;

  const filters = {
    search: sp.q,
    modalityId: sp.modality,
    status: sp.status,
  };

  const [rows, modalities, leadsForPicker] = await Promise.all([
    getEnrollmentsForList(membership, filters),
    prisma.modality.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.lead.findMany({
      where: {
        tenantId: tenant.id,
        ...(membership.role === "SELLER"
          ? { assignedSellerId: membership.userId }
          : {}),
        // Pickamos apenas leads SEM matrícula (1:1 — não dá pra criar duplicata)
        enrollment: null,
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, modalityId: true },
    }),
  ]);

  const totalActive = rows.filter((r) => r.status === "ACTIVE").length;
  const monthlyRevenue = rows
    .filter((r) => r.status === "ACTIVE")
    .reduce((sum, r) => sum + Number(r.monthlyValue), 0);

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
          <h1 className="text-xl font-semibold tracking-tight">Matrículas</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {rows.length} no período
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {user.email} · {membership.role.toLowerCase()}
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

      <section className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Ativas</div>
          <div className="mt-1 text-2xl font-semibold">{totalActive}</div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Receita mensal</div>
          <div className="mt-1 text-2xl font-semibold">
            {monthlyRevenue.toLocaleString("pt-BR", {
              style: "currency",
              currency: "BRL",
            })}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Canceladas</div>
          <div className="mt-1 text-2xl font-semibold">
            {rows.filter((r) => r.status === "CANCELED").length}
          </div>
        </div>
      </section>

      <EnrollmentsToolbar
        modalities={modalities}
        leads={leadsForPicker}
        initial={filters}
      />

      <EnrollmentsTable rows={rows} />
    </main>
  );
}

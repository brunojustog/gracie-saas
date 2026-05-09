import Link from "next/link";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/server/auth";
import { getLeadsForKanban } from "@/server/leads";
import { roleAtLeast } from "@/server/rbac";
import { requireTenantUser } from "@/server/tenant";

import { KanbanBoard } from "./kanban-board";
import { KanbanFilters } from "./filters";

type SearchParams = Promise<{
  q?: string;
  modality?: string;
  seller?: string;
}>;

export default async function KanbanPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, membership, user } = await requireTenantUser();
  const sp = await searchParams;

  const filters = {
    search: sp.q,
    modalityId: sp.modality,
    assignedSellerId: sp.seller,
  };

  const [stages, leads, modalities, sellers] = await Promise.all([
    prisma.stage.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { order: "asc" },
      select: {
        id: true,
        name: true,
        color: true,
        order: true,
        isWon: true,
        isLost: true,
      },
    }),
    getLeadsForKanban(membership, filters),
    prisma.modality.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    // SELLER não pode filtrar por outra vendedora — então nem mostramos
    membership.role === "SELLER"
      ? Promise.resolve([])
      : prisma.tenantUser
          .findMany({
            where: { tenantId: tenant.id, role: "SELLER", active: true },
            include: { user: { select: { id: true, name: true, email: true } } },
            orderBy: { createdAt: "asc" },
          })
          .then((rows) =>
            rows.map((r) => ({
              id: r.user.id,
              name: r.user.name ?? r.user.email,
            })),
          ),
  ]);

  return (
    <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-sm text-muted-foreground hover:underline"
          >
            ← {tenant.name}
          </Link>
          <h1 className="text-xl font-semibold tracking-tight">Funil comercial</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {leads.length} lead{leads.length === 1 ? "" : "s"}
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

      <KanbanFilters
        modalities={modalities}
        sellers={sellers}
        initial={filters}
      />

      <KanbanBoard
        stages={stages}
        leads={leads}
        modalities={modalities}
        sellers={sellers}
        canReassign={roleAtLeast(membership.role, "MANAGER")}
      />
    </main>
  );
}

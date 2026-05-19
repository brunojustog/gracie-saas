import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/server/auth";
import { getLeadsForKanban } from "@/server/leads";
import { getFollowUpSummariesForLeads } from "@/server/messaging/status";
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

  // URL base do Chatwoot pronta pra concatenar com conversationId (v1.1-T).
  // null quando o tenant não tem Chatwoot configurado — o card omite o link.
  // Trim na url pra evitar trailing slash duplicado.
  const chatwootConversationBaseUrl =
    tenant.chatwootUrl && tenant.chatwootAccountId
      ? `${tenant.chatwootUrl.replace(/\/+$/, "")}/app/accounts/${tenant.chatwootAccountId}/conversations/`
      : null;

  const [stages, leadsRaw, modalities, sellers] = await Promise.all([
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
        isScheduling: true,
      },
    }),
    getLeadsForKanban(membership, filters),
    prisma.modality.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.tenantUser
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

  // Hidrata cada card com o estado de follow-up (badge "M3/8", "pausado",
  // "concluído"…). Query única em batch — ver getFollowUpSummariesForLeads.
  const followUpByLead = await getFollowUpSummariesForLeads(
    tenant.id,
    leadsRaw.map((l) => l.id),
  );
  const leads = leadsRaw.map((l) => ({
    ...l,
    followUp: followUpByLead.get(l.id) ?? null,
  }));

  return (
    // h-svh + flex column: nav fixo no topo, board ocupa o resto da viewport
    // com scroll horizontal/vertical interno (em vez de empurrar a barra pro
    // fim da pagina inteira).
    <div className="flex h-svh flex-col">
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

      <main className="mx-auto flex w-full min-h-0 max-w-[1600px] flex-1 flex-col gap-3 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Funil comercial</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {leads.length} lead{leads.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>

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
          canReassign={true}
          currentUserId={user.id}
          isSeller={membership.role === "SELLER"}
          sellerOptionsForNewLead={sellers}
          chatwootConversationBaseUrl={chatwootConversationBaseUrl}
        />
      </main>
    </div>
  );
}

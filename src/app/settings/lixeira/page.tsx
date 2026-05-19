import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

import { RestoreButton } from "./restore-button";

export default async function LixeiraPage() {
  const { tenant } = await requireRole("ADMIN");

  const trashed = await prisma.lead.findMany({
    where: { tenantId: tenant.id, deletedAt: { not: null } },
    orderBy: { deletedAt: "desc" },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      deletedAt: true,
      deletionReason: true,
      deletedBy: { select: { id: true, name: true, email: true } },
      stage: { select: { name: true, color: true } },
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Lixeira</h2>
        <p className="text-xs text-muted-foreground">
          Leads excluídos por vendedoras (com motivo). Restaurar traz o lead
          de volta pro kanban e preserva todo o histórico de notas, aulas e
          matrículas.
        </p>
      </div>

      {trashed.length === 0 ? (
        <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
          A lixeira está vazia.
        </div>
      ) : (
        <div className="rounded-lg border bg-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left font-medium">Lead</th>
                <th className="px-3 py-2 text-left font-medium">Contato</th>
                <th className="px-3 py-2 text-left font-medium">Excluído em</th>
                <th className="px-3 py-2 text-left font-medium">Por</th>
                <th className="px-3 py-2 text-left font-medium">Motivo</th>
                <th className="px-3 py-2 text-right font-medium">Ação</th>
              </tr>
            </thead>
            <tbody>
              {trashed.map((l) => {
                const who =
                  l.deletedBy?.name ?? l.deletedBy?.email ?? "sistema";
                return (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-3 py-2">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        em <span className="font-medium">{l.stage.name}</span> antes
                        da exclusão
                      </div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {l.phone ?? l.email ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {l.deletedAt
                        ? format(new Date(l.deletedAt), "dd/MM/yy 'às' HH:mm", {
                            locale: ptBR,
                          })
                        : "—"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{who}</td>
                    <td className="px-3 py-2 max-w-md text-muted-foreground">
                      {l.deletionReason ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <RestoreButton leadId={l.id} leadName={l.name} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

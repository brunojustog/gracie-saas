import type { ExperimentalClassStatus } from "@prisma/client";
import { addDays, format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";
import { cn } from "@/lib/utils";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/server/auth";
import {
  getClassesForCalendar,
  getClassesForList,
  getScheduleSlots,
} from "@/server/experimental-classes";
import { requireTenantUser } from "@/server/tenant";

import { CalendarBoard } from "./calendar-board";
import { ExpListToolbar } from "./list-toolbar";

const VALID_STATUS: ExperimentalClassStatus[] = [
  "SCHEDULED",
  "CONFIRMED",
  "ATTENDED",
  "NO_SHOW",
  "RESCHEDULED",
  "CANCELED",
];

const STATUS_LABEL: Record<ExperimentalClassStatus, string> = {
  SCHEDULED: "Agendada",
  CONFIRMED: "Confirmada",
  ATTENDED: "Compareceu",
  NO_SHOW: "Faltou",
  RESCHEDULED: "Remarcada",
  CANCELED: "Cancelada",
};

const STATUS_TONE: Record<ExperimentalClassStatus, string> = {
  SCHEDULED: "bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200",
  CONFIRMED: "bg-cyan-100 text-cyan-900 dark:bg-cyan-900/40 dark:text-cyan-200",
  ATTENDED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200",
  NO_SHOW: "bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200",
  RESCHEDULED: "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  CANCELED: "bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
};

type SearchParams = Promise<{
  view?: string;
  q?: string;
  status?: string;
  modality?: string;
}>;

export default async function AulasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, membership, user } = await requireTenantUser();
  const sp = await searchParams;
  const isList = sp.view === "lista";

  const signOutSlot = (
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
  );

  const modalities = await prisma.modality.findMany({
    where: { tenantId: tenant.id, active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });

  const Header = (
    <TopNav
      tenantName={tenant.name}
      tenantColor={tenant.primaryColor}
      userEmail={user.email}
      role={membership.role}
      signOutSlot={signOutSlot}
    />
  );

  const ViewToggle = (
    <div className="inline-flex rounded-md border bg-card p-0.5 text-xs">
      <Link
        href="/aulas"
        className={cn(
          "rounded px-3 py-1 font-medium",
          !isList ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Calendário
      </Link>
      <Link
        href="/aulas?view=lista"
        className={cn(
          "rounded px-3 py-1 font-medium",
          isList ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
        )}
      >
        Lista
      </Link>
    </div>
  );

  if (isList) {
    // Filtros multi-seleção (v1.1-AX): status e modalidade vêm como CSV.
    const statuses = (sp.status ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is ExperimentalClassStatus =>
        VALID_STATUS.includes(s as ExperimentalClassStatus),
      );
    const modalityIds = (sp.modality ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    // Janela ampla pra lista: últimos 120 dias + próximos 60.
    const now = new Date();
    const rows = await getClassesForList(membership, {
      search: sp.q,
      statuses,
      modalityIds,
      from: addDays(now, -120),
      to: addDays(now, 60),
    });

    return (
      <>
        {Header}
        <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold tracking-tight">Aulas experimentais</h1>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                {rows.length} aula{rows.length === 1 ? "" : "s"}
              </span>
            </div>
            {ViewToggle}
          </div>

          <ExpListToolbar
            modalities={modalities.map((m) => ({ id: m.id, name: m.name }))}
            initial={{ q: sp.q, statuses, modalityIds }}
          />

          {rows.length === 0 ? (
            <div className="rounded-lg border bg-card p-12 text-center text-sm text-muted-foreground">
              Nenhuma aula encontrada com os filtros atuais.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2 text-left font-medium">Data</th>
                    <th className="px-3 py-2 text-left font-medium">Aluno</th>
                    <th className="px-3 py-2 text-left font-medium">Modalidade</th>
                    <th className="px-3 py-2 text-left font-medium">Vendedora</th>
                    <th className="px-3 py-2 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                        {format(new Date(r.scheduledDate), "dd/MM/yy HH:mm", { locale: ptBR })}
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{r.lead.name}</div>
                        {r.lead.phone ? (
                          <div className="text-[11px] text-muted-foreground">{r.lead.phone}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2">
                        <span className="flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ background: r.modality.color ?? "#6B7280" }}
                            aria-hidden
                          />
                          {r.modality.name}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {r.lead.assignedSeller?.name ?? r.lead.assignedSeller?.email ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-block rounded-full px-2 py-0.5 text-xs", STATUS_TONE[r.status])}>
                          {STATUS_LABEL[r.status]}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </main>
      </>
    );
  }

  // ── Visão calendário (default) ───────────────────────────────────────────
  const now = new Date();
  const from = startOfWeek(addDays(now, -14), { weekStartsOn: 1 });
  const to = startOfWeek(addDays(now, 28), { weekStartsOn: 1 });

  const [scheduleSlots, classes, leadsForPicker] = await Promise.all([
    getScheduleSlots(tenant.id),
    getClassesForCalendar(membership, { from, to }),
    prisma.lead.findMany({
      where: { tenantId: tenant.id, deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true, modalityId: true },
    }),
  ]);

  return (
    <>
      {Header}
      <main className="mx-auto max-w-[1600px] space-y-4 px-4 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold tracking-tight">Aulas experimentais</h1>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {classes.length} aula{classes.length === 1 ? "" : "s"} no período
            </span>
          </div>
          {ViewToggle}
        </div>

        <CalendarBoard
          scheduleSlots={scheduleSlots}
          initialClasses={classes}
          modalities={modalities}
          leads={leadsForPicker}
        />
      </main>
    </>
  );
}

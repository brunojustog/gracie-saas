import { addDays, startOfWeek } from "date-fns";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/server/auth";
import {
  getClassesForCalendar,
  getScheduleSlots,
} from "@/server/experimental-classes";
import { requireTenantUser } from "@/server/tenant";

import { CalendarBoard } from "./calendar-board";

export default async function AulasPage() {
  const { tenant, membership, user } = await requireTenantUser();

  // Range carregado server-side: 5 semanas (semana atual ± 2). Cobre as
  // navegações mais comuns sem refetch. Ao chegar nas pontas, o calendar
  // dispara router.refresh via callback do client.
  const now = new Date();
  const from = startOfWeek(addDays(now, -14), { weekStartsOn: 1 });
  const to = startOfWeek(addDays(now, 28), { weekStartsOn: 1 });

  const [scheduleSlots, classes, modalities, leadsForPicker] = await Promise.all([
    getScheduleSlots(tenant.id),
    getClassesForCalendar(membership, { from, to }),
    prisma.modality.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, color: true },
    }),
    // Picker do modal de agendar — SELLER vê só leads próprios
    prisma.lead.findMany({
      where: {
        tenantId: tenant.id,
        ...(membership.role === "SELLER"
          ? { assignedSellerId: membership.userId }
          : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        phone: true,
        modalityId: true,
      },
    }),
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
          <h1 className="text-xl font-semibold tracking-tight">Aulas experimentais</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {classes.length} aula{classes.length === 1 ? "" : "s"} no período
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

      <CalendarBoard
        scheduleSlots={scheduleSlots}
        initialClasses={classes}
        modalities={modalities}
        leads={leadsForPicker}
      />
    </main>
  );
}

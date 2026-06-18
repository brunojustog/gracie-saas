import type { EnrollmentStatus, Gender, PaymentMethod } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";
import { prisma } from "@/lib/prisma";
import { signOut } from "@/server/auth";
import { getEnrollmentsForList, type DueFilter } from "@/server/enrollments";
import { countOverdue } from "@/server/payments";
import { requireTenantUser } from "@/server/tenant";

import { EnrollmentsTable } from "./enrollments-table";
import { EnrollmentsToolbar } from "./toolbar";

const VALID_PAYMENT_METHODS: PaymentMethod[] = [
  "PIX",
  "CREDIT_CARD",
  "BOLETO",
  "CASH",
  "TRANSFER",
  "OTHER",
];

type SearchParams = Promise<{
  q?: string;
  modality?: string; // CSV multi-seleção: "id1,id2"
  plan?: string;
  payment?: string;
  status?: EnrollmentStatus;
  due?: string;
  gender?: string;
  dueDay?: string;
}>;

export default async function MatriculasPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { tenant, membership, user } = await requireTenantUser();
  const sp = await searchParams;
  const isSeller = membership.role === "SELLER";

  const paymentMethod = VALID_PAYMENT_METHODS.includes(sp.payment as PaymentMethod)
    ? (sp.payment as PaymentMethod)
    : undefined;

  const due: DueFilter | undefined =
    sp.due === "overdue" || sp.due === "due7" ? sp.due : undefined;

  const modalityIds = sp.modality
    ? sp.modality.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;
  const gender: Gender | undefined =
    sp.gender === "FEMALE" || sp.gender === "MALE" ? sp.gender : undefined;
  const dueDayNum = sp.dueDay ? Number(sp.dueDay) : NaN;
  const dueDay =
    Number.isInteger(dueDayNum) && dueDayNum >= 1 && dueDayNum <= 31
      ? dueDayNum
      : undefined;

  const filters = {
    search: sp.q,
    modalityIds,
    planId: sp.plan,
    paymentMethod,
    status: sp.status,
    due,
    gender,
    dueDay,
  };

  const [rows, overdueCount, modalities, plans, leadsForPicker] = await Promise.all([
    getEnrollmentsForList(membership, filters),
    countOverdue(membership),
    prisma.modality.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.plan.findMany({
      where: { tenantId: tenant.id, active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.lead.findMany({
      where: {
        tenantId: tenant.id,
        deletedAt: null,
        // Pickamos apenas leads SEM matrícula (1:1 — não dá pra criar duplicata)
        enrollment: null,
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, modalityId: true },
    }),
  ]);

  const totalActive = rows.filter((r) => r.status === "ACTIVE").length;
  // monthlyValue vem null pra SELLER (mascarado em getEnrollmentsForList);
  // o reduce abaixo só roda pra ADMIN/MANAGER de qualquer forma.
  const monthlyRevenue = isSeller
    ? 0
    : rows
        .filter((r) => r.status === "ACTIVE")
        .reduce((sum, r) => sum + Number(r.monthlyValue ?? 0), 0);

  return (
    <>
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
      <main className="mx-auto max-w-[1400px] space-y-4 px-4 py-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold tracking-tight">Matrículas</h1>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
            {rows.length} no período
          </span>
        </div>

        <section className={`grid gap-3 ${isSeller ? "sm:grid-cols-3" : "sm:grid-cols-4"}`}>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Ativas</div>
          <div className="mt-1 text-2xl font-semibold">{totalActive}</div>
        </div>
        <a
          href="/matriculas?due=overdue"
          className="rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40"
          title="Ver inadimplentes"
        >
          <div className="text-xs uppercase text-muted-foreground">Inadimplentes</div>
          <div className={`mt-1 text-2xl font-semibold ${overdueCount > 0 ? "text-red-700 dark:text-red-300" : ""}`}>
            {overdueCount}
          </div>
        </a>
        {isSeller ? null : (
          <div className="rounded-lg border bg-card p-4">
            <div className="text-xs uppercase text-muted-foreground">Receita mensal</div>
            <div className="mt-1 text-2xl font-semibold">
              {monthlyRevenue.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL",
              })}
            </div>
          </div>
        )}
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs uppercase text-muted-foreground">Canceladas</div>
          <div className="mt-1 text-2xl font-semibold">
            {rows.filter((r) => r.status === "CANCELED").length}
          </div>
        </div>
      </section>

        <EnrollmentsToolbar
          modalities={modalities}
          plans={plans}
          leads={leadsForPicker}
          initial={{
            search: filters.search,
            modalityIds: filters.modalityIds,
            planId: filters.planId,
            paymentMethod: filters.paymentMethod,
            status: filters.status,
            due: filters.due,
            gender: filters.gender,
            dueDay: filters.dueDay,
          }}
        />

        <EnrollmentsTable rows={rows} hideFinancials={isSeller} />
      </main>
    </>
  );
}

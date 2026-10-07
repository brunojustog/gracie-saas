/**
 * Camada de dados de Enrollment (matrícula).
 *
 * Política de visibilidade (v1.1-O): qualquer role do tenant vê todas
 * as matrículas do tenant. Espelha leads.ts/experimental-classes.ts.
 *
 * Enrollment é 1:1 com Lead — tentativa de criar duplicata viola constraint
 * unique do schema. Os helpers aqui assumem que essa unicidade está
 * garantida no banco e expõem erros amigáveis na server action.
 */
import { addDays, addMonths, differenceInCalendarDays, startOfDay } from "date-fns";
import type {
  Gender,
  PaymentMethod,
  Prisma,
  TenantUser,
} from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { overdueCutoff } from "@/lib/overdue";
import { appendLeadNote } from "@/server/lead-notes";

export function scopedEnrollmentWhere(
  membership: TenantUser,
): Prisma.EnrollmentWhereInput {
  return { tenantId: membership.tenantId };
}

/**
 * v1.1-AB: recorte por vencimento. Sempre implica status ACTIVE (cancelada/
 * congelada não cobra) — sobrepõe o filtro de status quando setado.
 *   - "overdue": inadimplentes (nextDueDate < hoje)
 *   - "due7": vence entre hoje e hoje+7 (inclusive)
 */
export type DueFilter = "overdue" | "due7";

/**
 * v1.1-AT/AU: "status" da matrícula na visão da lista. Congelada não é mais
 * um status no banco (é ACTIVE + suspendedAt) — aqui vira uma visão derivada.
 *   - ATIVA      = ACTIVE e não congelada
 *   - CONGELADA  = ACTIVE e congelada (suspendedAt != null)
 *   - SOLICITADO = CANCEL_REQUESTED (pediu cancelamento, ainda não pagou taxa)
 *   - CANCELADA  = CANCELED
 *   - JUDICIAL   = JUDICIAL
 */
export type StatusView =
  | "ATIVA"
  | "CONGELADA"
  | "SOLICITADO"
  | "CANCELADA"
  | "JUDICIAL";

function statusViewWhere(v: StatusView): Prisma.EnrollmentWhereInput {
  switch (v) {
    case "ATIVA":
      return { status: "ACTIVE", suspendedAt: null };
    case "CONGELADA":
      return { status: "ACTIVE", suspendedAt: { not: null } };
    case "SOLICITADO":
      return { status: "CANCEL_REQUESTED" };
    case "CANCELADA":
      return { status: "CANCELED" };
    case "JUDICIAL":
      return { status: "JUDICIAL" };
  }
}

export type EnrollmentListFilters = {
  search?: string;
  /** v1.1-AL: multi-seleção. Vazio/ausente = todas as modalidades. */
  modalityIds?: string[];
  /** v1.1-AX: multi-seleção. Vazio/ausente = todos os planos. */
  planIds?: string[];
  /** v1.1-AV: multi-seleção. */
  paymentMethods?: PaymentMethod[];
  /** v1.1-AV: multi-seleção de status (visão derivada). */
  statusViews?: StatusView[];
  due?: DueFilter;
  /** v1.1-AL: sexo do aluno. */
  gender?: Gender;
  /** v1.1-AL: dia do mês do vencimento (1-31). Filtrado em JS pós-fetch. */
  dueDay?: number;
};

export function buildEnrollmentListWhere(
  membership: TenantUser,
  filters: EnrollmentListFilters,
): Prisma.EnrollmentWhereInput {
  const where: Prisma.EnrollmentWhereInput = {
    tenantId: membership.tenantId,
  };

  if (filters.modalityIds && filters.modalityIds.length > 0) {
    where.modalityId = { in: filters.modalityIds };
  }
  if (filters.planIds && filters.planIds.length > 0) {
    where.planId = { in: filters.planIds };
  }
  if (filters.paymentMethods && filters.paymentMethods.length > 0) {
    where.paymentMethod = { in: filters.paymentMethods };
  }
  if (filters.statusViews && filters.statusViews.length > 0) {
    // Cada visão vira um fragmento; multi-seleção = OR.
    where.OR = filters.statusViews.map(statusViewWhere);
  }

  // Filtros que recaem no Lead (sexo + busca) compartilham o mesmo objeto.
  // deletedAt:null sempre — matrículas de leads excluídos (ex.: duplicatas)
  // não aparecem em listas nem contagens (v1.1-BA).
  const leadWhere: Prisma.LeadWhereInput = { deletedAt: null };
  if (filters.gender) leadWhere.gender = filters.gender;
  if (filters.search?.trim()) {
    leadWhere.name = { contains: filters.search.trim(), mode: "insensitive" };
  }

  if (filters.due) {
    const today = startOfDay(new Date());
    where.status = "ACTIVE";
    where.suspendedAt = filters.due === "overdue" ? undefined : where.suspendedAt;
    where.nextDueDate =
      filters.due === "overdue"
        ? { not: null, lt: overdueCutoff() } // inadimplente só após a carência
        : { not: null, gte: today, lt: addDays(today, 8) };
  }

  where.lead = leadWhere;

  return where;
}

/**
 * v1.2-BZ: infere a duração do plano (meses) pelo NOME quando não há
 * `durationMonths` cadastrado. Cobre a nomenclatura do GBAF ("Plano anual
 * fundador", "Mensal", etc.). Retorna null quando não dá pra inferir.
 */
export function inferDurationMonths(planName: string): number | null {
  const n = planName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, ""); // tira acentos
  if (/\banual\b|\bano\b|\banuidade\b/.test(n)) return 12;
  if (/\bsemestral\b|\bsemestre\b/.test(n)) return 6;
  if (/\btrimestral\b|\btrimestre\b/.test(n)) return 3;
  if (/\bbimestral\b|\bbimestre\b/.test(n)) return 2;
  if (/\bmensal\b|\bmes\b|\bmensalidade\b/.test(n)) return 1;
  return null;
}

export async function getEnrollmentsForList(
  membership: TenantUser,
  filters: EnrollmentListFilters = {},
) {
  const rows = await prisma.enrollment.findMany({
    where: buildEnrollmentListWhere(membership, filters),
    select: {
      id: true,
      enrolledAt: true,
      canceledAt: true,
      suspendedAt: true,
      suspensionReason: true,
      frozenKind: true,
      expectedReturnAt: true,
      frozenDaysUsed: true,
      contractEndAt: true,
      nextDueDate: true,
      paidInFullUntil: true,
      monthlyValue: true,
      paymentMethod: true,
      status: true,
      observations: true,
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          gender: true,
          belt: true,
          beltDegree: true,
          assignedSeller: { select: { id: true, name: true, email: true } },
          // v1.2-AY: link do nome pra ficha do aluno (só existe se o lead virou aluno).
          aluno: { select: { id: true } },
          // v1.2-BL: responsável pelo pagamento (nome no extrato).
          payerName: true,
        },
      },
      modality: { select: { id: true, name: true, color: true } },
      plan: { select: { id: true, name: true, durationMonths: true } },
    },
    orderBy: { enrolledAt: "desc" },
  });

  // Dia de vencimento filtra em JS (Prisma não filtra por EXTRACT(day)).
  const filtered = filters.dueDay
    ? rows.filter((r) => r.nextDueDate?.getDate() === filters.dueDay)
    : rows;

  // v1.2-BX/BZ: término do contrato = início + duração do plano + dias
  // congelados (acumulados + os em andamento, se ainda congelado). A duração
  // vem de `durationMonths` (Config → Planos); se null, é INFERIDA pelo nome do
  // plano (anual→12, mensal→1, etc.). Null = sem término fixo (cai no
  // contractEndAt legado se existir).
  const today = startOfDay(new Date());
  const planEndFor = (r: (typeof filtered)[number]): Date | null => {
    const months = r.plan.durationMonths ?? inferDurationMonths(r.plan.name);
    if (months == null) return r.contractEndAt ?? null;
    const base = addMonths(r.enrolledAt, months);
    const inProgress = r.suspendedAt
      ? Math.max(0, differenceInCalendarDays(today, startOfDay(r.suspendedAt)))
      : 0;
    return addDays(base, r.frozenDaysUsed + inProgress);
  };

  // SELLER não vê valor de matrícula — mascara no payload pra não vazar via
  // RSC stream / DevTools. UI espelha com `hideFinancials`.
  const isSeller = membership.role === "SELLER";
  return filtered.map((r) => ({
    ...r,
    monthlyValue: isSeller ? null : r.monthlyValue,
    planEndAt: planEndFor(r),
  }));
}

export async function findEnrollmentInScope(
  membership: TenantUser,
  enrollmentId: string,
) {
  return prisma.enrollment.findFirst({
    where: { id: enrollmentId, ...scopedEnrollmentWhere(membership) },
  });
}

/**
 * Contagens globais de matrículas por situação (v1.1-AV). Independe dos
 * filtros da lista — alimenta os KPIs da tela e o Quadro do Vitor.
 *   - ativas: ACTIVE não congeladas
 *   - congeladas: ACTIVE congeladas (suspendedAt != null)
 *   - canceladas: CANCELED
 *   - judicial: JUDICIAL
 *   - cancelamentosTotal: canceladas + judicial (o "cancelamento" do negócio)
 *   - monthlyRevenue: soma dos ativos (inclui congelados, que seguem cobrando)
 */
export async function getEnrollmentStatusCounts(membership: TenantUser) {
  const tenantId = membership.tenantId;
  // Ignora matrículas de leads excluídos (duplicatas removidas) — v1.1-BA.
  const live = { tenantId, lead: { deletedAt: null } };
  // v1.1-BB: quitados (paidInFullUntil >= hoje) saem da receita recorrente.
  const today = startOfDay(new Date());
  const notPrepaid = { NOT: { paidInFullUntil: { gte: today } } };
  const [active, frozen, requested, canceled, judicial, revenueAgg] = await Promise.all([
    prisma.enrollment.count({ where: { ...live, status: "ACTIVE", suspendedAt: null } }),
    prisma.enrollment.count({ where: { ...live, status: "ACTIVE", suspendedAt: { not: null } } }),
    // v1.1-BN: cancelamento solicitado — já parou de cobrar, não é mais vigente.
    prisma.enrollment.count({ where: { ...live, status: "CANCEL_REQUESTED" } }),
    prisma.enrollment.count({ where: { ...live, status: "CANCELED" } }),
    prisma.enrollment.count({ where: { ...live, status: "JUDICIAL" } }),
    prisma.enrollment.aggregate({
      where: { ...live, status: "ACTIVE", ...notPrepaid },
      _sum: { monthlyValue: true },
    }),
  ]);
  return {
    ativas: active,
    congeladas: frozen,
    totalAtivos: active + frozen,
    solicitadas: requested,
    canceladas: canceled,
    judicial,
    // "Cancelamento" do negócio = efetivados + judicial + solicitados (o aluno
    // já pediu pra sair e paramos de cobrar).
    cancelamentosTotal: canceled + judicial + requested,
    monthlyRevenue: Number(revenueAgg._sum.monthlyValue ?? 0),
  };
}

export type EnrollmentRow = Awaited<
  ReturnType<typeof getEnrollmentsForList>
>[number];

/**
 * v1.2-AP: solicitações de cancelamento pendentes (status CANCEL_REQUESTED) —
 * pro alerta no topo do dashboard. Mostra em que etapa está cada uma.
 */
export type PendingCancellation = {
  enrollmentId: string;
  leadId: string;
  alunoNome: string;
  plano: string;
  vencimento: Date | null;
  solicitadoEm: Date | null;
  taxaPagaEm: Date | null;
  recorrenciaCanceladaEm: Date | null;
  vendedora: string | null;
};

export async function getPendingCancellations(
  tenantId: string,
): Promise<PendingCancellation[]> {
  const rows = await prisma.enrollment.findMany({
    where: { tenantId, status: "CANCEL_REQUESTED" },
    orderBy: { cancelRequestedAt: "asc" },
    select: {
      id: true,
      leadId: true,
      nextDueDate: true,
      cancelRequestedAt: true,
      exitFeePaidAt: true,
      recurrenceCanceledAt: true,
      plan: { select: { name: true } },
      lead: {
        select: {
          name: true,
          assignedSeller: { select: { name: true, email: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    enrollmentId: r.id,
    leadId: r.leadId,
    alunoNome: r.lead.name,
    plano: r.plan.name,
    vencimento: r.nextDueDate,
    solicitadoEm: r.cancelRequestedAt,
    taxaPagaEm: r.exitFeePaidAt,
    recorrenciaCanceladaEm: r.recurrenceCanceledAt,
    vendedora: r.lead.assignedSeller?.name ?? r.lead.assignedSeller?.email ?? null,
  }));
}

// ──────────────────────────────────────────────────────────────────────────
// Congelamento (v1.1-AT) — descongelar + automação (v1.2-BX, reunião 06/10)
// ──────────────────────────────────────────────────────────────────────────

export const FROZEN_TAG = "Congelado";
export const FERIAS_LIMIT_DAYS = 30;

type UnfreezeTarget = {
  id: string;
  tenantId: string;
  leadId: string;
  suspendedAt: Date | null;
  frozenKind: string | null;
  frozenDaysUsed: number;
  contractEndAt: Date | null;
};

/**
 * Núcleo do descongelamento (fonte única). Acumula os dias congelados em
 * `frozenDaysUsed` e estende `contractEndAt` pelo mesmo tanto. `asOf` é a data
 * de referência do fim do congelamento (default = agora; no automático = a
 * data de retorno prevista, pra não contar dias além do atestado). FÉRIAS é
 * limitada a FERIAS_LIMIT_DAYS. Não faz revalidatePath (quem chama decide).
 */
export async function unfreezeEnrollment(
  enrollment: UnfreezeTarget,
  opts: { authorId?: string | null; auto?: boolean; asOf?: Date } = {},
): Promise<{ frozenDays: number; newTotal: number; newContractEnd: Date | null }> {
  if (!enrollment.suspendedAt) {
    return { frozenDays: 0, newTotal: enrollment.frozenDaysUsed, newContractEnd: enrollment.contractEndAt };
  }
  const asOf = opts.asOf ?? new Date();
  const rawDays = Math.max(
    0,
    differenceInCalendarDays(startOfDay(asOf), startOfDay(enrollment.suspendedAt)),
  );
  const frozenDays =
    enrollment.frozenKind === "FERIAS" ? Math.min(rawDays, FERIAS_LIMIT_DAYS) : rawDays;
  const newTotal = enrollment.frozenDaysUsed + frozenDays;
  const newContractEnd = enrollment.contractEndAt
    ? addDays(enrollment.contractEndAt, frozenDays)
    : null;

  await prisma.$transaction(async (tx) => {
    await tx.enrollment.update({
      where: { id: enrollment.id },
      data: {
        suspendedAt: null,
        suspensionReason: null,
        frozenKind: null,
        expectedReturnAt: null,
        frozenDaysUsed: newTotal,
        ...(newContractEnd ? { contractEndAt: newContractEnd } : {}),
      },
    });
    const lead = await tx.lead.findUnique({
      where: { id: enrollment.leadId },
      select: { tags: true },
    });
    if (lead?.tags.includes(FROZEN_TAG)) {
      await tx.lead.update({
        where: { id: enrollment.leadId },
        data: { tags: lead.tags.filter((t) => t !== FROZEN_TAG) },
      });
    }
    await appendLeadNote(
      {
        tenantId: enrollment.tenantId,
        leadId: enrollment.leadId,
        authorId: opts.authorId ?? undefined,
        kind: "ENROLLMENT_REACTIVATED",
        body: `${opts.auto ? "Descongelado automaticamente" : "Descongelado"} — ${frozenDays} dia(s) a repor (total acumulado: ${newTotal})${newContractEnd ? `; novo fim de contrato ${newContractEnd.toLocaleDateString("pt-BR")}` : ""}.`,
        metadata: { enrollmentId: enrollment.id, frozenDays, frozenDaysTotal: newTotal, auto: !!opts.auto },
      },
      tx,
    );
  });

  return { frozenDays, newTotal, newContractEnd };
}

/**
 * v1.2-BX: descongela automaticamente as matrículas cujo retorno previsto já
 * chegou (expectedReturnAt <= hoje) e que seguem congeladas. Usa a própria
 * data de retorno como referência dos dias congelados (não conta além do
 * atestado). Rodado no cron diário.
 */
export async function runAutoUnfreeze(
  now: Date = new Date(),
): Promise<{ unfrozen: number }> {
  const today = startOfDay(now);
  const due = await prisma.enrollment.findMany({
    where: {
      status: "ACTIVE",
      suspendedAt: { not: null },
      expectedReturnAt: { not: null, lte: today },
    },
    select: {
      id: true,
      tenantId: true,
      leadId: true,
      suspendedAt: true,
      frozenKind: true,
      frozenDaysUsed: true,
      contractEndAt: true,
      expectedReturnAt: true,
    },
  });
  let unfrozen = 0;
  for (const e of due) {
    try {
      await unfreezeEnrollment(e, { auto: true, asOf: e.expectedReturnAt ?? now });
      unfrozen++;
    } catch (err) {
      console.error("[runAutoUnfreeze] erro na matrícula", e.id, err);
    }
  }
  return { unfrozen };
}

/**
 * v1.2-BX: matrículas congeladas AGORA (pro alerta no dashboard). Ordena pela
 * data de retorno prevista; marca as que já deveriam ter voltado (atrasadas).
 */
export type FrozenEnrollment = {
  enrollmentId: string;
  leadId: string;
  alunoId: string | null;
  alunoNome: string;
  frozenKind: string | null;
  suspendedAt: Date | null;
  expectedReturnAt: Date | null;
  overdue: boolean;
};

export async function getFrozenEnrollments(
  tenantId: string,
): Promise<FrozenEnrollment[]> {
  const today = startOfDay(new Date());
  const rows = await prisma.enrollment.findMany({
    where: { tenantId, status: "ACTIVE", suspendedAt: { not: null } },
    orderBy: { expectedReturnAt: "asc" },
    select: {
      id: true,
      leadId: true,
      suspendedAt: true,
      expectedReturnAt: true,
      frozenKind: true,
      lead: { select: { name: true, aluno: { select: { id: true } } } },
    },
  });
  return rows.map((r) => ({
    enrollmentId: r.id,
    leadId: r.leadId,
    alunoId: r.lead.aluno?.id ?? null,
    alunoNome: r.lead.name,
    frozenKind: r.frozenKind,
    suspendedAt: r.suspendedAt,
    expectedReturnAt: r.expectedReturnAt,
    overdue: r.expectedReturnAt != null && r.expectedReturnAt < today,
  }));
}

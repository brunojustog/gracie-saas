/**
 * Camada de dados do "Quadro do Vitor" (v1.1-AK) — painel gerencial
 * ADMIN-only. Tudo escopado por tenant. Uma chamada (`getQuadroData`)
 * monta todos os blocos via Promise.all.
 *
 * Decisão de design: como o volume é pequeno (centenas de matrículas),
 * puxamos linhas cruas e agregamos em JS — mais legível e flexível que
 * vários groupBy/raw, sem custo relevante.
 */
import {
  differenceInCalendarDays,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";

import { prisma } from "@/lib/prisma";
import { isOverdue } from "@/lib/overdue";
import { getLooseRevenue } from "@/server/loose-classes";
import { getPrivatePackageCounts, getPrivateRevenue } from "@/server/private-packages";

/**
 * v1.1-BH: a partir de quando o painel "Matrículas com/sem experimental" é
 * confiável. Dados anteriores não têm o vínculo experimental→matrícula
 * registrado, então só contamos matrículas feitas daqui pra frente.
 */
export const EXP_SPLIT_SINCE = new Date(2026, 5, 25); // 25/06/2026

/** Percentual seguro (0 quando o denominador é 0). */
export function ratePct(part: number, total: number): number {
  if (total <= 0) return 0;
  return (part / total) * 100;
}

/** Starts de mês, do mais antigo ao atual (n meses, incluindo o corrente). */
export function lastMonthStarts(now: Date, n: number): Date[] {
  const out: Date[] = [];
  for (let i = n - 1; i >= 0; i--) out.push(startOfMonth(subMonths(now, i)));
  return out;
}

/**
 * v1.1-AP: matrícula "ativa" numa data — MESMA definição do número grande
 * do quadro (status ACTIVE). Conta como ativa em `date` se:
 *   - já estava matriculada (enrolledAt <= date);
 *   - não estava cancelada (canceledAt null ou posterior a date);
 *   - não estava congelada (não é SUSPENDED com suspendedAt <= date).
 *
 * Sem isso, congelados (SUSPENDED) inflavam o crescimento e a conta
 * "início + novas − cancelamentos" não batia com os ativos de hoje —
 * faltava o fluxo de congelamentos. `suspendedAt` guarda só a última
 * suspensão (reativar limpa), então meses passados são aproximação; o mês
 * corrente reconcilia exato com o número grande.
 */
export type GrowthEnrollment = {
  enrolledAt: Date;
  canceledAt: Date | null;
  status: string;
  suspendedAt: Date | null;
};

export function isActiveAt(e: GrowthEnrollment, date: Date): boolean {
  if (e.enrolledAt > date) return false;
  if (e.canceledAt && e.canceledAt <= date) return false;
  if (e.status === "SUSPENDED" && e.suspendedAt && e.suspendedAt <= date) return false;
  return true;
}

export function countActiveAt(enrollments: GrowthEnrollment[], date: Date): number {
  return enrollments.filter((e) => isActiveAt(e, date)).length;
}

type GenderSplit = { female: number; male: number; unknown: number };

function emptySplit(): GenderSplit {
  return { female: 0, male: 0, unknown: 0 };
}

export async function getQuadroData(
  tenantId: string,
  // v1.1-BE: período da segmentação de experimentais (item 4). Default = mês
  // atual. Só afeta os painéis de experimentais; o resto do Quadro é "agora".
  expPeriod?: { from: Date; to: Date; label: string },
) {
  const now = new Date();
  const today = startOfDay(now);

  const thisWeekStart = startOfWeek(now, { weekStartsOn: 1 });
  const thisWeekEnd = endOfWeek(now, { weekStartsOn: 1 });
  const prevWeekStart = new Date(thisWeekStart.getTime() - 7 * 86400_000);
  const since90 = new Date(today.getTime() - 90 * 86400_000);
  const since30 = new Date(today.getTime() - 30 * 86400_000);
  const since7 = new Date(today.getTime() - 7 * 86400_000);

  const monthStart = startOfMonth(now);
  const nextMonthStart = startOfMonth(subMonths(now, -1));

  // Período da segmentação de experimentais (item 4). Default = mês atual.
  const ep = expPeriod ?? {
    from: monthStart,
    to: now,
    label: format(monthStart, "MMMM/yy", { locale: ptBR }),
  };

  const [
    activeEnrollments,
    canceledEnrollments,
    allEnrollments,
    salesEnrollments,
    attendedClasses,
    posExpLeads,
    agendaClasses,
    privateRevenue,
    privateCounts,
    privateActiveRows,
    monthClasses,
    expOutcomeLeads,
    looseRevenue,
    enrollmentsForExpSplit,
  ] = await Promise.all([
    // Matrículas ativas (gênero + kids + plano + pagamento + vencimento +
    // nome do aluno pro drill-down v1.1-AY).
    prisma.enrollment.findMany({
      where: { tenantId, status: "ACTIVE", lead: { deletedAt: null } },
      select: {
        id: true,
        nextDueDate: true,
        paidInFullUntil: true,
        paymentMethod: true,
        monthlyValue: true,
        plan: { select: { id: true, name: true } },
        modality: { select: { isKids: true } },
        lead: { select: { name: true, gender: true } },
      },
      orderBy: { lead: { name: "asc" } },
    }),
    // Cancelamentos na vida da academia — inclui JUDICIAL (v1.1-AU).
    // findMany (em vez de count) pra alimentar o drill-down de nomes.
    prisma.enrollment.findMany({
      where: {
        tenantId,
        status: { in: ["CANCELED", "JUDICIAL"] },
        lead: { deletedAt: null },
      },
      select: {
        id: true,
        status: true,
        canceledAt: true,
        lead: { select: { name: true } },
      },
      orderBy: { canceledAt: "desc" },
    }),
    // Todas as matrículas (pra crescimento + churn mês a mês).
    // v1.1-BE: ignora leads excluídos (duplicatas) — alinha o churn com o
    // painel de Cancelamentos. v1.1-BF: +id/nome pro drill-down do churn.
    prisma.enrollment.findMany({
      where: { tenantId, lead: { deletedAt: null } },
      select: {
        id: true,
        enrolledAt: true,
        canceledAt: true,
        status: true,
        suspendedAt: true,
        lead: { select: { name: true } },
      },
    }),
    // v1.1-BF: TODAS as matrículas (vitalício) pro ranking por vendedora —
    // o quadro mostra todos os meses (de abril/26 em diante).
    prisma.enrollment.findMany({
      where: {
        tenantId,
        lead: { deletedAt: null },
      },
      select: {
        id: true,
        enrolledAt: true,
        monthlyValue: true,
        lead: {
          select: {
            name: true,
            assignedSeller: { select: { id: true, name: true, email: true } },
          },
        },
      },
    }),
    // Aulas experimentais comparecidas nos últimos 90d (conversão)
    prisma.experimentalClass.findMany({
      where: { tenantId, status: "ATTENDED", scheduledDate: { gte: since90 } },
      select: {
        leadId: true,
        scheduledDate: true,
        lead: { select: { enrollment: { select: { id: true } } } },
      },
    }),
    // Leads que fizeram experimental e seguem em conversa (sem matrícula,
    // não perdidos, não excluídos)
    prisma.lead.findMany({
      where: {
        tenantId,
        deletedAt: null,
        enrollment: { is: null },
        stage: { isLost: false },
        experimentalClasses: { some: {} },
      },
      select: {
        id: true,
        name: true,
        phone: true,
        lastInteractionAt: true,
        stage: { select: { name: true } },
        modality: { select: { name: true } },
        assignedSeller: { select: { name: true, email: true } },
        experimentalClasses: {
          select: { scheduledDate: true, status: true },
          orderBy: { scheduledDate: "desc" },
          take: 1,
        },
      },
      orderBy: { lastInteractionAt: "desc" },
    }),
    // Agenda de experimentais: semana passada + semana atual
    prisma.experimentalClass.findMany({
      where: { tenantId, scheduledDate: { gte: prevWeekStart, lte: thisWeekEnd } },
      select: {
        scheduledDate: true,
        status: true,
        lead: { select: { name: true, phone: true } },
        modality: { select: { name: true } },
      },
      orderBy: { scheduledDate: "asc" },
    }),
    // Receita de aulas particulares (v1.1-AO)
    getPrivateRevenue(tenantId, monthStart, nextMonthStart),
    getPrivatePackageCounts(tenantId),
    // Pacotes particulares em andamento — nomes pro drill-down (v1.1-AY).
    prisma.privatePackage.findMany({
      where: { tenantId, status: "ACTIVE" },
      select: {
        id: true,
        totalClasses: true,
        lead: { select: { name: true } },
        modality: { select: { name: true } },
      },
      orderBy: { startDate: "desc" },
    }),
    // v1.1-BC/BE: aulas experimentais do PERÍODO — stats + por programa (item 6/7).
    prisma.experimentalClass.findMany({
      where: { tenantId, scheduledDate: { gte: ep.from, lte: ep.to } },
      select: {
        id: true,
        scheduledDate: true,
        status: true,
        lead: { select: { name: true } },
        modality: { select: { name: true } },
      },
      orderBy: { scheduledDate: "asc" },
    }),
    // v1.1-BC/BE: destino dos leads que fizeram experimental NO PERÍODO (item 8).
    // "Matriculou" = tem Enrollment (fonte da verdade), não estágio Ganho.
    prisma.lead.findMany({
      where: {
        tenantId,
        deletedAt: null,
        experimentalClasses: { some: { scheduledDate: { gte: ep.from, lte: ep.to } } },
      },
      select: {
        id: true,
        name: true,
        stage: { select: { name: true, isLost: true } },
        enrollment: { select: { id: true } },
      },
    }),
    // Receita de aulas avulsas (v1.1-BD)
    getLooseRevenue(tenantId, monthStart, nextMonthStart),
    // v1.1-BF/BH (item 2): matrículas com/sem aula experimental, contando só
    // de EXP_SPLIT_SINCE em diante (dados antigos sem vínculo confiável).
    prisma.enrollment.findMany({
      where: {
        tenantId,
        lead: { deletedAt: null },
        enrolledAt: { gte: EXP_SPLIT_SINCE },
      },
      select: {
        id: true,
        lead: {
          select: {
            name: true,
            experimentalClasses: { select: { id: true }, take: 1 },
          },
        },
      },
      orderBy: { enrolledAt: "desc" },
    }),
  ]);

  // ── Bloco "Número de matrículas" ─────────────────────────────────────────
  // Drill-down (v1.1-AY): além das contagens, junta os NOMES por bucket pra
  // o número clicável abrir a lista de quem está por trás dele.
  type Name = { id: string; name: string; sub?: string | null; href?: string };
  const enrollHref = (name: string) =>
    `/matriculas?q=${encodeURIComponent(name)}`;

  const adults = emptySplit();
  const kids = emptySplit();
  let overdue = 0;
  let monthlyRecurring = 0;
  const byPlan = new Map<string, number>();
  const byPayment = new Map<string, number>();

  const activeNames: Name[] = [];
  const overdueNames: Name[] = [];
  const adultsNames: { female: Name[]; male: Name[]; unknown: Name[] } = {
    female: [],
    male: [],
    unknown: [],
  };
  const kidsNames: { female: Name[]; male: Name[]; unknown: Name[] } = {
    female: [],
    male: [],
    unknown: [],
  };
  const planNames = new Map<string, Name[]>();
  const paymentNames = new Map<string, Name[]>();

  for (const e of activeEnrollments) {
    const item: Name = {
      id: e.id,
      name: e.lead.name,
      sub: e.plan.name,
      href: enrollHref(e.lead.name),
    };
    activeNames.push(item);
    if (isOverdue(e.nextDueDate, now)) {
      overdue++;
      overdueNames.push({
        ...item,
        sub: e.nextDueDate
          ? `venceu ${format(e.nextDueDate, "dd/MM", { locale: ptBR })}`
          : "sem vencimento",
      });
    }
    // v1.1-BB: quitados (pagaram vários meses de uma vez) não entram na
    // receita mensal recorrente — o valor já foi recebido de uma vez.
    const prepaid = e.paidInFullUntil != null && e.paidInFullUntil >= today;
    if (!prepaid) monthlyRecurring += Number(e.monthlyValue);

    const isKids = e.modality.isKids;
    const bucket = isKids ? kids : adults;
    const namesBucket = isKids ? kidsNames : adultsNames;
    if (e.lead.gender === "FEMALE") {
      bucket.female++;
      namesBucket.female.push(item);
    } else if (e.lead.gender === "MALE") {
      bucket.male++;
      namesBucket.male.push(item);
    } else {
      bucket.unknown++;
      namesBucket.unknown.push(item);
    }

    byPlan.set(e.plan.name, (byPlan.get(e.plan.name) ?? 0) + 1);
    if (!planNames.has(e.plan.name)) planNames.set(e.plan.name, []);
    planNames.get(e.plan.name)!.push(item);

    byPayment.set(e.paymentMethod, (byPayment.get(e.paymentMethod) ?? 0) + 1);
    if (!paymentNames.has(e.paymentMethod)) paymentNames.set(e.paymentMethod, []);
    paymentNames.get(e.paymentMethod)!.push(item);
  }
  const totalActive = activeEnrollments.length;
  const totalAdults = adults.female + adults.male + adults.unknown;
  const totalKids = kids.female + kids.male + kids.unknown;

  // Nomes de cancelados/judicial e particulares ativos (drill-down).
  const STATUS_PT: Record<string, string> = {
    CANCELED: "Cancelada",
    JUDICIAL: "Judicial",
  };
  const canceledNames: Name[] = canceledEnrollments.map((e) => ({
    id: e.id,
    name: e.lead.name,
    sub: e.canceledAt
      ? `${STATUS_PT[e.status] ?? e.status} · ${format(e.canceledAt, "dd/MM/yy", { locale: ptBR })}`
      : (STATUS_PT[e.status] ?? e.status),
    href: enrollHref(e.lead.name),
  }));
  const privateActiveNames: Name[] = privateActiveRows.map((p) => ({
    id: p.id,
    name: p.lead.name,
    sub: `${p.modality?.name ?? "—"} · ${p.totalClasses} aulas`,
  }));

  // Item de drill-down a partir de uma matrícula (id + nome do lead).
  const matriculaItem = (e: { id: string; lead: { name: string } }): Name => ({
    id: e.id,
    name: e.lead.name,
    href: enrollHref(e.lead.name),
  });

  // ── Crescimento (ativos no 1º dia de cada mês) + churn mensal ────────────
  const months = lastMonthStarts(now, 6);
  const growth = months.map((mStart, i) => {
    const monthEnd =
      i + 1 < months.length
        ? months[i + 1]!
        : startOfMonth(subMonths(now, -1)); // início do próximo mês
    const activeStart = countActiveAt(allEnrollments, mStart);
    // v1.1-BF: além das contagens, guarda os NOMES (drill-down clicável).
    const canceledList = allEnrollments.filter(
      (e) => e.canceledAt && e.canceledAt >= mStart && e.canceledAt < monthEnd,
    );
    const newList = allEnrollments.filter(
      (e) => e.enrolledAt >= mStart && e.enrolledAt < monthEnd,
    );
    // Congelamentos no mês (3º fluxo: nem novo, nem cancelamento). v1.1-AT:
    // congelado é ACTIVE + suspendedAt, então conta por suspendedAt no mês.
    const frozenInMonth = allEnrollments.filter(
      (e) => e.suspendedAt && e.suspendedAt >= mStart && e.suspendedAt < monthEnd,
    ).length;
    return {
      label: format(mStart, "MMM/yy", { locale: ptBR }),
      activeStart,
      newInMonth: newList.length,
      newNames: newList.map(matriculaItem),
      canceledInMonth: canceledList.length,
      canceledNames: canceledList.map(matriculaItem),
      frozenInMonth,
      churnPct: ratePct(canceledList.length, activeStart),
    };
  });

  // ── Matrículas por vendedora — TODOS os meses (v1.1-BF, de abril/26 em
  // diante). Gera a lista de meses do mais antigo (1ª matrícula) até agora.
  const earliest = salesEnrollments.reduce<Date | null>(
    (min, e) => (min === null || e.enrolledAt < min ? e.enrolledAt : min),
    null,
  );
  const firstMonth = earliest ? startOfMonth(earliest) : monthStart;
  const salesMonths: Date[] = [];
  for (
    let m = firstMonth;
    m <= monthStart;
    m = startOfMonth(subMonths(m, -1))
  ) {
    salesMonths.push(m);
  }
  const salesMonthEnds = salesMonths.map((m, i) =>
    i + 1 < salesMonths.length ? salesMonths[i + 1]! : startOfMonth(subMonths(now, -1)),
  );
  type SellerRow = {
    name: string;
    counts: number[];
    names: Name[][];
    total: number;
    totalNames: Name[];
  };
  const sellerMap = new Map<string, SellerRow>();
  for (const e of salesEnrollments) {
    const seller = e.lead.assignedSeller;
    const key = seller?.id ?? "__none__";
    const name = seller?.name ?? seller?.email ?? "(sem vendedora)";
    if (!sellerMap.has(key)) {
      sellerMap.set(key, {
        name,
        counts: salesMonths.map(() => 0),
        names: salesMonths.map(() => []),
        total: 0,
        totalNames: [],
      });
    }
    const row = sellerMap.get(key)!;
    const idx = salesMonths.findIndex(
      (m, i) => e.enrolledAt >= m && e.enrolledAt < salesMonthEnds[i]!,
    );
    if (idx >= 0) {
      const item = matriculaItem(e);
      row.counts[idx]!++;
      row.names[idx]!.push(item);
      row.total++;
      row.totalNames.push(item);
    }
  }
  const sellerRanking = [...sellerMap.values()].sort((a, b) => b.total - a.total);

  // ── Matrículas com/sem aula experimental (v1.1-BF, item 2; vitalício) ─────
  const comExp: Name[] = [];
  const semExp: Name[] = [];
  for (const e of enrollmentsForExpSplit) {
    const item: Name = {
      id: e.id,
      name: e.lead.name,
      href: enrollHref(e.lead.name),
    };
    if (e.lead.experimentalClasses.length > 0) comExp.push(item);
    else semExp.push(item);
  }
  const matriculasExp = {
    total: enrollmentsForExpSplit.length,
    comExp,
    semExp,
  };

  // ── Conversão experimental → matrícula (30d e 90d) ───────────────────────
  const convWindow = (since: Date) => {
    const inWindow = attendedClasses.filter((c) => c.scheduledDate >= since);
    const leadIds = new Set(inWindow.map((c) => c.leadId));
    const converted = new Set(
      inWindow.filter((c) => c.lead.enrollment).map((c) => c.leadId),
    );
    return {
      attended: leadIds.size,
      enrolled: converted.size,
      pct: ratePct(converted.size, leadIds.size),
    };
  };
  const conversion = { d30: convWindow(since30), d90: convWindow(since90) };

  // ── Pós-experimental em conversa (item 2) ────────────────────────────────
  const posExperimental = posExpLeads.map((l) => {
    const lastClass = l.experimentalClasses[0];
    return {
      id: l.id,
      name: l.name,
      phone: l.phone,
      stage: l.stage.name,
      modality: l.modality?.name ?? null,
      seller: l.assignedSeller?.name ?? l.assignedSeller?.email ?? null,
      lastClassAt: lastClass?.scheduledDate ?? null,
      lastClassStatus: lastClass?.status ?? null,
      daysSince: lastClass
        ? differenceInCalendarDays(today, startOfDay(lastClass.scheduledDate))
        : null,
    };
  });
  const posExpLastWeek = posExperimental.filter(
    (l) => l.lastClassAt && l.lastClassAt >= since7,
  ).length;

  // ── Agenda: semana passada × semana atual ────────────────────────────────
  const mapClass = (c: (typeof agendaClasses)[number]) => ({
    scheduledDate: c.scheduledDate,
    status: c.status,
    leadName: c.lead.name,
    phone: c.lead.phone,
    modality: c.modality.name,
  });
  const agenda = {
    lastWeek: agendaClasses
      .filter((c) => c.scheduledDate >= prevWeekStart && c.scheduledDate < thisWeekStart)
      .map(mapClass),
    thisWeek: agendaClasses
      .filter((c) => c.scheduledDate >= thisWeekStart && c.scheduledDate <= thisWeekEnd)
      .map(mapClass),
  };

  // ── Experimentais do mês: stats + por programa (v1.1-BC, itens 6/7) ───────
  const kanbanHref = (name: string) => `/kanban?q=${encodeURIComponent(name)}`;
  const classItem = (c: (typeof monthClasses)[number]): Name => ({
    id: c.id,
    name: c.lead.name,
    sub: `${format(c.scheduledDate, "dd/MM", { locale: ptBR })} · ${c.modality.name}`,
    href: kanbanHref(c.lead.name),
  });
  const isOpen = (s: string) => s === "SCHEDULED" || s === "CONFIRMED";
  const notCanceled = monthClasses.filter((c) => c.status !== "CANCELED");
  const expStats = {
    total: notCanceled.length,
    totalNames: notCanceled.map(classItem),
    attended: notCanceled.filter((c) => c.status === "ATTENDED").map(classItem),
    noShow: notCanceled.filter((c) => c.status === "NO_SHOW").map(classItem),
    rescheduled: notCanceled.filter((c) => c.status === "RESCHEDULED").map(classItem),
    upcoming: notCanceled
      .filter((c) => isOpen(c.status) && c.scheduledDate > now)
      .map(classItem),
    unregistered: notCanceled
      .filter((c) => isOpen(c.status) && c.scheduledDate <= now)
      .map(classItem),
  };

  // Por programa (GB1/GB2/GBF/GBK…). GBK-* colapsa em "GBK".
  const programOf = (modName: string) =>
    modName.startsWith("GBK") ? "GBK" : modName;
  const programMap = new Map<string, Name[]>();
  for (const c of notCanceled) {
    const p = programOf(c.modality.name);
    if (!programMap.has(p)) programMap.set(p, []);
    programMap.get(p)!.push(classItem(c));
  }
  const expByProgram = [...programMap.entries()]
    .map(([program, names]) => ({ program, count: names.length, names }))
    .sort((a, b) => b.count - a.count);

  // ── Destino dos leads que fizeram experimental no período (v1.1-BC/BE) ─────
  // Prioridade: matriculou (Enrollment) > perda > negociação > nutrição.
  // "Matriculou" usa Enrollment como fonte da verdade (decisão BE), batendo
  // com Churn e Dashboard.
  const outcomeItem = (lead: (typeof expOutcomeLeads)[number]): Name => ({
    id: lead.id,
    name: lead.name,
    sub: lead.enrollment ? "matriculado" : lead.stage.name,
    href: kanbanHref(lead.name),
  });
  const expOutcomes = {
    matriculou: [] as Name[],
    negociacao: [] as Name[],
    nutricao: [] as Name[],
    perda: [] as Name[],
  };
  for (const l of expOutcomeLeads) {
    const item = outcomeItem(l);
    if (l.enrollment) expOutcomes.matriculou.push(item);
    else if (l.stage.isLost) expOutcomes.perda.push(item);
    else if (l.stage.name === "Negociação") expOutcomes.negociacao.push(item);
    else if (l.stage.name === "Nutrição") expOutcomes.nutricao.push(item);
  }

  return {
    generatedAt: now,
    matriculas: {
      totalActive,
      overdue,
      adults: { ...adults, total: totalAdults },
      kids: { ...kids, total: totalKids },
    },
    planos: [...byPlan.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
    pagamento: [...byPayment.entries()]
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count),
    cancelamentos: canceledEnrollments.length,
    // Aulas particulares (v1.1-AV) — SEPARADO dos mensalistas + total geral.
    particulares: {
      ativos: privateCounts.active,
      concluidos: privateCounts.completed,
      cancelados: privateCounts.canceled,
    },
    totalGeralAlunos: totalActive + privateCounts.active,
    // Drill-down (v1.1-AY): nomes por trás de cada número clicável do Quadro.
    names: {
      ativos: activeNames,
      overdue: overdueNames,
      adults: adultsNames,
      kids: kidsNames,
      byPlan: Object.fromEntries(planNames),
      byPayment: Object.fromEntries(paymentNames),
      cancelamentos: canceledNames,
      particularesAtivos: privateActiveNames,
    },
    growth,
    salesMonthLabels: salesMonths.map((m) => format(m, "MMM/yy", { locale: ptBR })),
    sellerRanking,
    matriculasExp,
    conversion,
    posExperimental,
    posExpLastWeek,
    agenda,
    // Experimentais do período (v1.1-BC/BE, itens 6/7/8).
    expPeriodLabel: ep.label,
    expStats,
    expByProgram,
    expOutcomes,
    // Receita (v1.1-AO/BD): mensalidades + aulas particulares + avulsas.
    revenue: {
      monthlyRecurring,
      privateThisMonth: privateRevenue.thisMonth,
      privateAllTime: privateRevenue.allTime,
      privateActiveCount: privateRevenue.activeCount,
      looseThisMonth: looseRevenue.thisMonth,
      looseAllTime: looseRevenue.allTime,
      looseCountThisMonth: looseRevenue.countThisMonth,
      looseCountAllTime: looseRevenue.countAllTime,
      globalThisMonth:
        monthlyRecurring + privateRevenue.thisMonth + looseRevenue.thisMonth,
    },
  };
}

export type QuadroData = Awaited<ReturnType<typeof getQuadroData>>;

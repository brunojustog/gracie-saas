/**
 * v1.2-AX: ficha do aluno (admin). Junta, para um alunoId no tenant, tudo que
 * temos hoje: dados pessoais (via Lead), matrícula/mensalidade (Enrollment),
 * histórico de pagamentos (PaymentRecord), compras da lojinha (Sale),
 * frequência (CheckIn) e graduações. Só dados que já coletamos — campos que o
 * GBAPP tem e nós não (CPF, endereço, avaliação médica) ficam de fora.
 */
import type { TenantUser } from "@prisma/client";

import { prisma } from "@/lib/prisma";

import { getAlunoProgress, getAlunoTimeline, nextGraduation } from "./graduations";
import { getSalesForLead } from "./pdv";

export type AlunoFicha = Awaited<ReturnType<typeof getAlunoFicha>>;

export async function getAlunoFicha(membership: TenantUser, alunoId: string) {
  const aluno = await prisma.aluno.findFirst({
    where: { id: alunoId, tenantId: membership.tenantId },
    select: {
      id: true,
      leadId: true,
      matricula: true,
      active: true,
      photoMime: true,
      lastGraduationAt: true,
      createdAt: true,
      lead: {
        select: {
          name: true,
          phone: true,
          email: true,
          gender: true,
          birthDate: true,
          belt: true,
          beltDegree: true,
          enrollment: {
            select: {
              id: true,
              status: true,
              monthlyValue: true,
              nextDueDate: true,
              paymentMethod: true,
              paidInFullUntil: true,
              enrolledAt: true,
              plan: { select: { name: true } },
            },
          },
        },
      },
      user: { select: { email: true } },
    },
  });

  if (!aluno) return null;

  const enr = aluno.lead.enrollment;

  const [payments, sales, progress, graduations, checkIns] = await Promise.all([
    enr
      ? prisma.paymentRecord.findMany({
          where: { enrollmentId: enr.id },
          orderBy: { paidAt: "desc" },
          take: 36,
          select: {
            id: true,
            paidAt: true,
            dueDate: true,
            amount: true,
            method: true,
            notes: true,
            confirmedBy: { select: { name: true, email: true } },
          },
        })
      : Promise.resolve([]),
    getSalesForLead(membership, aluno.leadId),
    getAlunoProgress(aluno.id, aluno.lastGraduationAt),
    getAlunoTimeline(membership.tenantId, aluno.id),
    prisma.checkIn.findMany({
      where: { alunoId: aluno.id, present: true },
      orderBy: { session: { date: "desc" } },
      take: 20,
      select: {
        id: true,
        confirmedAt: true,
        source: true,
        session: {
          select: { date: true, startTime: true, label: true },
        },
      },
    }),
  ]);

  const now = new Date();
  const overdue =
    enr?.status === "ACTIVE" &&
    enr.nextDueDate != null &&
    enr.nextDueDate < now &&
    !(enr.paidInFullUntil && enr.paidInFullUntil >= now);

  const totalGasto = sales.reduce((s, v) => s + v.total, 0);

  return {
    id: aluno.id,
    nome: aluno.lead.name,
    matricula: aluno.matricula,
    active: aluno.active,
    hasPhoto: aluno.photoMime != null,
    createdAt: aluno.createdAt,
    phone: aluno.lead.phone,
    email: aluno.user?.email ?? aluno.lead.email,
    hasLogin: aluno.user?.email != null,
    gender: aluno.lead.gender,
    birthDate: aluno.lead.birthDate,
    belt: aluno.lead.belt,
    beltDegree: aluno.lead.beltDegree,
    nextGrad: nextGraduation(aluno.lead.belt, aluno.lead.beltDegree),
    progress,
    enrollment: enr
      ? {
          status: enr.status,
          monthlyValue: Number(enr.monthlyValue),
          nextDueDate: enr.nextDueDate,
          paymentMethod: enr.paymentMethod,
          enrolledAt: enr.enrolledAt,
          planName: enr.plan?.name ?? null,
          overdue,
        }
      : null,
    payments: payments.map((p) => ({
      id: p.id,
      paidAt: p.paidAt,
      dueDate: p.dueDate,
      amount: Number(p.amount),
      method: p.method,
      notes: p.notes,
      confirmedBy: p.confirmedBy?.name ?? p.confirmedBy?.email ?? null,
    })),
    sales,
    totalGasto,
    graduations,
    checkIns: checkIns.map((c) => ({
      id: c.id,
      date: c.session.date,
      startTime: c.session.startTime,
      label: c.session.label,
      source: c.source,
      confirmedAt: c.confirmedAt,
    })),
  };
}

/**
 * Camada de dados de ExperimentalClass (aula experimental).
 *
 * Política de visibilidade (v1.1-O): qualquer role do tenant vê todas
 * as aulas do tenant. Espelha leads.ts/enrollments.ts.
 */
import type { Prisma, TenantUser } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function scopedClassWhere(
  membership: TenantUser,
): Prisma.ExperimentalClassWhereInput {
  return { tenantId: membership.tenantId };
}

/** Aulas do tenant agendadas dentro de [from, to). */
export async function getClassesForCalendar(
  membership: TenantUser,
  range: { from: Date; to: Date },
) {
  return prisma.experimentalClass.findMany({
    where: {
      ...scopedClassWhere(membership),
      scheduledDate: { gte: range.from, lt: range.to },
    },
    select: {
      id: true,
      scheduledDate: true,
      status: true,
      notes: true,
      modalityId: true,
      leadId: true,
      modality: { select: { id: true, name: true, color: true } },
      lead: {
        select: {
          id: true,
          name: true,
          phone: true,
          assignedSellerId: true,
          assignedSeller: { select: { id: true, name: true, email: true } },
        },
      },
    },
    orderBy: { scheduledDate: "asc" },
  });
}

/** Slots da grade fixa do tenant (background events do calendar). */
export async function getScheduleSlots(tenantId: string) {
  return prisma.classSchedule.findMany({
    where: { tenantId, active: true, modality: { active: true } },
    select: {
      id: true,
      dayOfWeek: true,
      startTime: true,
      durationMinutes: true,
      modalityId: true,
      modality: { select: { id: true, name: true, color: true } },
    },
  });
}

export async function findClassInScope(
  membership: TenantUser,
  classId: string,
) {
  return prisma.experimentalClass.findFirst({
    where: { id: classId, ...scopedClassWhere(membership) },
  });
}

export type CalendarClass = Awaited<
  ReturnType<typeof getClassesForCalendar>
>[number];

export type ScheduleSlot = Awaited<ReturnType<typeof getScheduleSlots>>[number];

/**
 * Regra de inadimplência (v1.1-AQ) — fonte única.
 *
 * Carência: um aluno só é considerado INADIMPLENTE a partir de
 * `OVERDUE_GRACE_DAYS` dias APÓS o vencimento, se o pagamento não foi
 * confirmado. Motivo operacional: quem venceu ontem ainda pode ter pago
 * hoje (a baixa é manual), então acusar na hora gera falso positivo.
 *
 * Ex. com carência 2: vence dia 18 → só aparece como inadimplente dia 20.
 * Nos dias 18 e 19 fica em "carência" (não cobra ainda).
 *
 * Puro/client-safe (sem Prisma) — reutilizado em dashboard, matrículas e
 * Quadro do Vitor, e como filtro Prisma via `overdueCutoff`.
 */
import { startOfDay, subDays } from "date-fns";

export const OVERDUE_GRACE_DAYS = 2;

/**
 * Data-limite: matrículas com `nextDueDate < overdueCutoff` estão
 * inadimplentes (já passaram da carência). Comparação por dia (ignora a
 * hora do `nextDueDate`): vencimento em qualquer hora do dia D só cruza o
 * limite quando hoje >= D + OVERDUE_GRACE_DAYS.
 */
export function overdueCutoff(now: Date = new Date()): Date {
  return subDays(startOfDay(now), OVERDUE_GRACE_DAYS - 1);
}

/** True se a matrícula está inadimplente (vencida além da carência). */
export function isOverdue(
  nextDueDate: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return nextDueDate != null && nextDueDate < overdueCutoff(now);
}

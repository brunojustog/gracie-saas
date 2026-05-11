/**
 * Cálculo das datas absolutas das mensagens automáticas.
 *
 * Janela de envio: 08:00–21:00 BRT. Mensagens que cairiam fora são empurradas
 * pro próximo slot válido. Brasil não usa DST desde 2019 → offset UTC-3 fixo.
 */

const BRT_OFFSET_HOURS = -3;
const WINDOW_OPEN_HOUR_BRT = 8;
const WINDOW_CLOSE_HOUR_BRT = 21;
const MORNING_HOUR_BRT = 9;

function brtHourToUtc(year: number, month0: number, day: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(year, month0, day, hour - BRT_OFFSET_HOURS, minute));
}

function brtParts(d: Date): { year: number; month0: number; day: number; hour: number } {
  const shifted = new Date(d.getTime() + BRT_OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month0: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

export function clampToWindow(d: Date): Date {
  const parts = brtParts(d);
  if (parts.hour < WINDOW_OPEN_HOUR_BRT) {
    return brtHourToUtc(parts.year, parts.month0, parts.day, WINDOW_OPEN_HOUR_BRT);
  }
  if (parts.hour >= WINDOW_CLOSE_HOUR_BRT) {
    return brtHourToUtc(parts.year, parts.month0, parts.day + 1, MORNING_HOUR_BRT);
  }
  return d;
}

/**
 * Cadência oficial da Etapa Novo Lead (8 mensagens em 7 dias).
 *
 *   M1 — start (imediato, dentro da janela)
 *   M2 — M1 + 2h
 *   M3 — M2 + 3h
 *   M4..M7 — manhã dos dias 2, 3, 4, 5
 *   M8 — manhã do dia 7 (encerramento)
 *
 * Returned na mesma ordem das keys "welcome.m1"..."welcome.m8".
 */
export function computeWelcomeSchedule(start: Date): Date[] {
  const m1 = clampToWindow(start);
  const m2 = clampToWindow(new Date(m1.getTime() + 2 * 60 * 60 * 1000));
  const m3 = clampToWindow(new Date(m2.getTime() + 3 * 60 * 60 * 1000));
  const m1Parts = brtParts(m1);
  const morningOf = (offsetDays: number) =>
    brtHourToUtc(m1Parts.year, m1Parts.month0, m1Parts.day + offsetDays, MORNING_HOUR_BRT);
  return [m1, m2, m3, morningOf(1), morningOf(2), morningOf(3), morningOf(4), morningOf(6)];
}

/**
 * Lembretes da Etapa Agendamento, computados a partir do horário marcado da AE.
 *
 *   confirm — imediato (caller chama logo após criar a AE)
 *   d-1     — 18h BRT do dia anterior (pega a vendedora no fim de expediente)
 *   d-0     — 09h BRT do dia da aula
 *   1h-before — exatamente 1h antes do horário da aula
 *
 * Returns null para slots impossíveis (ex: AE marcada pra daqui a 30 minutos
 * já está dentro de "1h antes" — o caller decide se manda na hora).
 */
export type AppointmentSchedule = {
  confirm: Date;
  dMinus1: Date | null;
  dZero: Date | null;
  oneHourBefore: Date | null;
};

export function computeAppointmentSchedule(
  scheduledFor: Date,
  now: Date = new Date(),
): AppointmentSchedule {
  const ahead = scheduledFor.getTime() - now.getTime();
  const oneHour = 60 * 60 * 1000;
  const oneDay = 24 * oneHour;

  const parts = brtParts(scheduledFor);
  const dMinus1At18h = brtHourToUtc(parts.year, parts.month0, parts.day - 1, 18);
  const dZeroAt9h = brtHourToUtc(parts.year, parts.month0, parts.day, MORNING_HOUR_BRT);
  const oneHourBefore = new Date(scheduledFor.getTime() - oneHour);

  return {
    confirm: now,
    dMinus1: ahead > oneDay && dMinus1At18h > now ? dMinus1At18h : null,
    dZero: ahead > 2 * oneHour && dZeroAt9h > now ? dZeroAt9h : null,
    oneHourBefore: ahead > oneHour ? oneHourBefore : null,
  };
}

/**
 * Cadência de no-show. Caller passa o `scheduledFor` da AE que faltou.
 *
 *   no-show-1 — mesmo dia da aula, ~2h depois do horário marcado
 *   no-show-2 — D+2 às 10h (manhã do método consultivo)
 *   no-show-3 — D+5 às 10h (encerramento)
 *
 * Todas clampadas pra janela 08-21h.
 */
export function computeNoShowSchedule(scheduledFor: Date): {
  noShow1: Date;
  noShow2: Date;
  noShow3: Date;
} {
  const noShow1 = clampToWindow(new Date(scheduledFor.getTime() + 2 * 60 * 60 * 1000));
  const parts = brtParts(scheduledFor);
  const at10h = (offset: number) =>
    brtHourToUtc(parts.year, parts.month0, parts.day + offset, 10);
  return {
    noShow1,
    noShow2: at10h(2),
    noShow3: at10h(5),
  };
}

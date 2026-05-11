/**
 * Cálculo das datas absolutas das 8 mensagens do follow-up de Novo Lead.
 *
 * Janela de envio: 08:00–21:00 BRT. Mensagens que cairiam fora são empurradas
 * pro próximo slot válido (antes das 08 → 08h do mesmo dia; depois das 21 →
 * 09h do dia seguinte).
 *
 * Brasil não usa DST desde 2019, então o offset BRT = UTC-3 é constante.
 * Mantenho o cálculo em UTC explícito pra evitar surpresa quando o container
 * roda em outro fuso (Docker default = UTC).
 */

const BRT_OFFSET_HOURS = -3; // BRT = UTC - 3
const WINDOW_OPEN_HOUR_BRT = 8;
const WINDOW_CLOSE_HOUR_BRT = 21;
const MORNING_HOUR_BRT = 9;

/** Constrói uma Date UTC a partir de hora local BRT. */
function brtHourToUtc(year: number, month0: number, day: number, hour: number): Date {
  return new Date(Date.UTC(year, month0, day, hour - BRT_OFFSET_HOURS));
}

/** Extrai componentes (ano/mês/dia/hora) em horário BRT de uma Date UTC. */
function brtParts(d: Date): { year: number; month0: number; day: number; hour: number } {
  const shifted = new Date(d.getTime() + BRT_OFFSET_HOURS * 60 * 60 * 1000);
  return {
    year: shifted.getUTCFullYear(),
    month0: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
  };
}

/**
 * Empurra a data pro próximo slot dentro da janela 08-21h BRT.
 * Idempotente: clampar 2x dá o mesmo resultado.
 */
export function clampToWindow(d: Date): Date {
  const parts = brtParts(d);
  if (parts.hour < WINDOW_OPEN_HOUR_BRT) {
    return brtHourToUtc(parts.year, parts.month0, parts.day, WINDOW_OPEN_HOUR_BRT);
  }
  if (parts.hour >= WINDOW_CLOSE_HOUR_BRT) {
    // Próximo dia, 09h (manhã)
    return brtHourToUtc(parts.year, parts.month0, parts.day + 1, MORNING_HOUR_BRT);
  }
  return d;
}

/**
 * Cadência oficial (Etapa Novo Lead do playbook):
 *
 *   M1 — start (imediato)
 *   M2 — M1 + 2h
 *   M3 — M2 + 3h
 *   M4 — Dia 2 (manhã)
 *   M5 — Dia 3
 *   M6 — Dia 4
 *   M7 — Dia 5
 *   M8 — Dia 7 (encerramento)
 *
 * "Dia N" é contado a partir do dia em que M1 caiu (após clamp), não do `start`.
 */
export function computeSequenceSchedule(start: Date): Date[] {
  const m1 = clampToWindow(start);
  const m2 = clampToWindow(new Date(m1.getTime() + 2 * 60 * 60 * 1000));
  const m3 = clampToWindow(new Date(m2.getTime() + 3 * 60 * 60 * 1000));

  const m1Parts = brtParts(m1);
  const morningOf = (offsetDays: number) =>
    brtHourToUtc(
      m1Parts.year,
      m1Parts.month0,
      m1Parts.day + offsetDays,
      MORNING_HOUR_BRT,
    );

  return [
    m1,
    m2,
    m3,
    morningOf(1), // M4
    morningOf(2), // M5
    morningOf(3), // M6
    morningOf(4), // M7
    morningOf(6), // M8 (dia 7)
  ];
}

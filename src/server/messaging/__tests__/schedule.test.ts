import { describe, expect, it } from "vitest";

import {
  clampToWindow,
  computeAppointmentSchedule,
  computeNoShowSchedule,
  computeWelcomeSchedule,
} from "../schedule";

function brt(y: number, m: number, d: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, hour + 3, minute));
}

function brtHour(date: Date): number {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).getUTCHours();
}

function brtDay(date: Date): number {
  return new Date(date.getTime() - 3 * 60 * 60 * 1000).getUTCDate();
}

describe("clampToWindow", () => {
  it("mantém dentro da janela", () => {
    const t = brt(2026, 5, 11, 14, 30);
    expect(clampToWindow(t)).toEqual(t);
  });

  it("antes das 08h → 08h mesmo dia", () => {
    const clamped = clampToWindow(brt(2026, 5, 11, 5, 0));
    expect(brtHour(clamped)).toBe(8);
    expect(brtDay(clamped)).toBe(11);
  });

  it(">= 21h → 09h dia seguinte", () => {
    const clamped = clampToWindow(brt(2026, 5, 11, 22, 0));
    expect(brtHour(clamped)).toBe(9);
    expect(brtDay(clamped)).toBe(12);
  });

  it("idempotente", () => {
    const t = brt(2026, 5, 11, 5, 0);
    expect(clampToWindow(clampToWindow(t))).toEqual(clampToWindow(t));
  });
});

describe("computeWelcomeSchedule", () => {
  it("gera 8 datas", () => {
    expect(computeWelcomeSchedule(brt(2026, 5, 11, 10, 0))).toHaveLength(8);
  });

  it("M1=start, M2=+2h, M3=+3h após M2", () => {
    const [m1, m2, m3] = computeWelcomeSchedule(brt(2026, 5, 11, 10, 0));
    expect(brtHour(m1!)).toBe(10);
    expect(brtHour(m2!)).toBe(12);
    expect(brtHour(m3!)).toBe(15);
  });

  it("M4..M8 = manhãs dos dias +1, +2, +3, +4 e +6", () => {
    const schedule = computeWelcomeSchedule(brt(2026, 5, 11, 10, 0));
    expect(brtDay(schedule[3]!)).toBe(12);
    expect(brtDay(schedule[7]!)).toBe(17);
    expect(brtHour(schedule[3]!)).toBe(9);
  });
});

describe("computeAppointmentSchedule", () => {
  it("AE daqui a 3 dias 18:30 — todos os 4 slots válidos", () => {
    const now = brt(2026, 5, 11, 10, 0);
    const ae = brt(2026, 5, 14, 18, 30);
    const sched = computeAppointmentSchedule(ae, now);
    expect(sched.confirm).toEqual(now);
    expect(sched.dMinus1).not.toBeNull();
    expect(brtHour(sched.dMinus1!)).toBe(18);
    expect(brtDay(sched.dMinus1!)).toBe(13);
    expect(sched.dZero).not.toBeNull();
    expect(brtHour(sched.dZero!)).toBe(9);
    expect(brtDay(sched.dZero!)).toBe(14);
    expect(sched.oneHourBefore).not.toBeNull();
    expect(sched.oneHourBefore!.getTime()).toBe(ae.getTime() - 60 * 60 * 1000);
  });

  it("AE daqui a 30 min — pula 1h-before e D-0 e D-1", () => {
    const now = brt(2026, 5, 11, 18, 0);
    const ae = brt(2026, 5, 11, 18, 30);
    const sched = computeAppointmentSchedule(ae, now);
    expect(sched.confirm).toEqual(now);
    expect(sched.dMinus1).toBeNull();
    expect(sched.dZero).toBeNull();
    expect(sched.oneHourBefore).toBeNull();
  });

  it("AE daqui a 3h — só confirm + 1h-before", () => {
    const now = brt(2026, 5, 11, 15, 0);
    const ae = brt(2026, 5, 11, 18, 0);
    const sched = computeAppointmentSchedule(ae, now);
    expect(sched.confirm).toEqual(now);
    expect(sched.dMinus1).toBeNull();
    expect(sched.oneHourBefore).not.toBeNull();
  });

  it("AE em 6h no mesmo dia — confirm + d-0 (se ainda > now) + 1h-before", () => {
    const now = brt(2026, 5, 11, 6, 0);
    const ae = brt(2026, 5, 11, 12, 0);
    const sched = computeAppointmentSchedule(ae, now);
    expect(sched.dMinus1).toBeNull(); // < 24h de antecedência
    expect(sched.dZero).not.toBeNull();
    expect(brtHour(sched.dZero!)).toBe(9);
    expect(brtDay(sched.dZero!)).toBe(11);
  });
});

describe("computeNoShowSchedule", () => {
  it("gera 3 datas: mesmo dia +2h, D+2 10h, D+5 10h", () => {
    const ae = brt(2026, 5, 11, 14, 30);
    const { noShow1, noShow2, noShow3 } = computeNoShowSchedule(ae);
    expect(brtDay(noShow1)).toBe(11);
    expect(brtDay(noShow2)).toBe(13);
    expect(brtDay(noShow3)).toBe(16);
    expect(brtHour(noShow2)).toBe(10);
    expect(brtHour(noShow3)).toBe(10);
  });

  it("AE às 20h → no-show 1 vira manhã do dia seguinte (clamped)", () => {
    const ae = brt(2026, 5, 11, 20, 0);
    const { noShow1 } = computeNoShowSchedule(ae);
    // 20h + 2h = 22h → clamped pra 09h do dia 12
    expect(brtDay(noShow1)).toBe(12);
    expect(brtHour(noShow1)).toBe(9);
  });
});

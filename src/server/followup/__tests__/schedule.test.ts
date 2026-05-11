import { describe, expect, it } from "vitest";

import { clampToWindow, computeSequenceSchedule } from "../schedule";

/**
 * Helper pra construir Date a partir de hora local BRT (UTC-3).
 * Ex: brt(2026, 5, 11, 14, 0) → 14:00 BRT = 17:00 UTC.
 */
function brt(y: number, m: number, d: number, hour: number, minute = 0): Date {
  return new Date(Date.UTC(y, m - 1, d, hour + 3, minute));
}

function brtHour(date: Date): number {
  const shifted = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return shifted.getUTCHours();
}

function brtDay(date: Date): number {
  const shifted = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return shifted.getUTCDate();
}

describe("clampToWindow", () => {
  it("mantém hora dentro da janela 08-21h", () => {
    const t = brt(2026, 5, 11, 14, 30);
    expect(clampToWindow(t)).toEqual(t);
  });

  it("empurra horário antes das 08h pra 08h do mesmo dia", () => {
    const t = brt(2026, 5, 11, 5, 0);
    const clamped = clampToWindow(t);
    expect(brtHour(clamped)).toBe(8);
    expect(brtDay(clamped)).toBe(11);
  });

  it("empurra horário 21h ou depois pra 09h do dia seguinte", () => {
    const t = brt(2026, 5, 11, 21, 0);
    const clamped = clampToWindow(t);
    expect(brtHour(clamped)).toBe(9);
    expect(brtDay(clamped)).toBe(12);
  });

  it("empurra 23h pra 09h do dia seguinte", () => {
    const t = brt(2026, 5, 11, 23, 45);
    const clamped = clampToWindow(t);
    expect(brtHour(clamped)).toBe(9);
    expect(brtDay(clamped)).toBe(12);
  });

  it("é idempotente — clampar 2x = clampar 1x", () => {
    const t = brt(2026, 5, 11, 5, 0);
    const once = clampToWindow(t);
    const twice = clampToWindow(once);
    expect(twice).toEqual(once);
  });
});

describe("computeSequenceSchedule", () => {
  it("gera 8 datas", () => {
    const schedule = computeSequenceSchedule(brt(2026, 5, 11, 10, 0));
    expect(schedule).toHaveLength(8);
  });

  it("M1 = imediato dentro da janela; M2 = +2h; M3 = +3h após M2", () => {
    const start = brt(2026, 5, 11, 10, 0);
    const [m1, m2, m3] = computeSequenceSchedule(start);
    expect(m1).toEqual(start);
    expect(brtHour(m2!)).toBe(12);
    expect(brtHour(m3!)).toBe(15);
    expect(brtDay(m2!)).toBe(11);
    expect(brtDay(m3!)).toBe(11);
  });

  it("M2 que cairia depois das 21h vira 08h do dia seguinte", () => {
    // start às 20h → M2 às 22h → clamped pra 09h dia seguinte
    const start = brt(2026, 5, 11, 20, 0);
    const [m1, m2] = computeSequenceSchedule(start);
    expect(brtDay(m1!)).toBe(11);
    expect(brtHour(m1!)).toBe(20);
    expect(brtDay(m2!)).toBe(12);
    expect(brtHour(m2!)).toBe(9);
  });

  it("M4..M8 são na manhã (09h BRT) dos dias 2, 3, 4, 5 e 7", () => {
    const start = brt(2026, 5, 11, 10, 0);
    const schedule = computeSequenceSchedule(start);
    const dayN = (i: number) => brtDay(schedule[i]!);
    expect(dayN(3)).toBe(12); // M4 = dia 2
    expect(dayN(4)).toBe(13); // M5 = dia 3
    expect(dayN(5)).toBe(14); // M6 = dia 4
    expect(dayN(6)).toBe(15); // M7 = dia 5
    expect(dayN(7)).toBe(17); // M8 = dia 7 (pula 1)
    expect(brtHour(schedule[3]!)).toBe(9);
    expect(brtHour(schedule[7]!)).toBe(9);
  });

  it("se M1 é clampado pro dia seguinte, M4..M8 contam a partir do dia do M1", () => {
    // start às 03h → M1 vai pra 08h do mesmo dia
    const start = brt(2026, 5, 11, 3, 0);
    const [m1, , , m4] = computeSequenceSchedule(start);
    expect(brtDay(m1!)).toBe(11);
    expect(brtHour(m1!)).toBe(8);
    expect(brtDay(m4!)).toBe(12); // dia seguinte ao M1
  });

  it("start às 23h: M1 cai no próximo dia 09h, e M4 é dia+1 do M1 (não do start)", () => {
    const start = brt(2026, 5, 11, 23, 0);
    const [m1, , , m4] = computeSequenceSchedule(start);
    expect(brtDay(m1!)).toBe(12);
    expect(brtHour(m1!)).toBe(9);
    expect(brtDay(m4!)).toBe(13);
  });
});

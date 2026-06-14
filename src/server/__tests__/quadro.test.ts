import { describe, expect, it } from "vitest";

import { lastMonthStarts, ratePct } from "../quadro";

describe("ratePct", () => {
  it("calcula percentual", () => {
    expect(ratePct(1, 4)).toBe(25);
    expect(ratePct(3, 3)).toBe(100);
  });
  it("denominador zero → 0 (sem NaN/Infinity)", () => {
    expect(ratePct(5, 0)).toBe(0);
    expect(ratePct(0, 0)).toBe(0);
  });
});

describe("lastMonthStarts", () => {
  it("retorna n starts de mês, do mais antigo ao atual", () => {
    const now = new Date(2026, 5, 14); // 14/jun/2026
    const months = lastMonthStarts(now, 6);
    expect(months).toHaveLength(6);
    // todos são dia 1
    expect(months.every((d) => d.getDate() === 1)).toBe(true);
    // último é o mês corrente (junho = índice 5)
    expect(months[5]!.getMonth()).toBe(5);
    // primeiro é janeiro
    expect(months[0]!.getMonth()).toBe(0);
    // ordem crescente
    for (let i = 1; i < months.length; i++) {
      expect(months[i]!.getTime()).toBeGreaterThan(months[i - 1]!.getTime());
    }
  });
});

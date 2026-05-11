import { describe, expect, it } from "vitest";

import {
  previousPeriod,
  resolveCustom,
  resolvePreset,
  variationPct,
} from "../period";

describe("resolvePreset", () => {
  const fixedNow = new Date("2026-05-15T14:30:00.000-03:00");

  it("this_month começa no dia 1 do mês corrente", () => {
    const p = resolvePreset("this_month", fixedNow);
    expect(p.preset).toBe("this_month");
    expect(p.from.getMonth()).toBe(4); // Maio (0-indexed)
    expect(p.from.getDate()).toBe(1);
    expect(p.to.getMonth()).toBe(4);
  });

  it("last_month abrange mês inteiro anterior", () => {
    const p = resolvePreset("last_month", fixedNow);
    expect(p.preset).toBe("last_month");
    expect(p.from.getMonth()).toBe(3); // Abril
    expect(p.from.getDate()).toBe(1);
    expect(p.to.getMonth()).toBe(3); // Abril
  });

  it("last_7_days cobre 7 dias incluindo hoje", () => {
    const p = resolvePreset("last_7_days", fixedNow);
    const days = Math.round((p.to.getTime() - p.from.getTime()) / (24 * 3600 * 1000));
    expect(days).toBeGreaterThanOrEqual(6);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("last_30_days cobre 30 dias", () => {
    const p = resolvePreset("last_30_days", fixedNow);
    const days = Math.round((p.to.getTime() - p.from.getTime()) / (24 * 3600 * 1000));
    expect(days).toBeGreaterThanOrEqual(29);
    expect(days).toBeLessThanOrEqual(30);
  });
});

describe("previousPeriod", () => {
  it("retorna janela imediatamente anterior com mesma duração", () => {
    const p = resolvePreset("last_7_days", new Date("2026-05-15T12:00:00Z"));
    const prev = previousPeriod(p);

    const currentDuration = p.to.getTime() - p.from.getTime();
    const prevDuration = prev.to.getTime() - prev.from.getTime();
    // Mesma duração ± 1ms (offset)
    expect(Math.abs(currentDuration - prevDuration)).toBeLessThan(2);

    // prev.to deve estar imediatamente antes de p.from
    expect(prev.to.getTime()).toBe(p.from.getTime() - 1);
  });
});

describe("variationPct", () => {
  it("retorna variação positiva quando current > previous", () => {
    expect(variationPct(120, 100)).toBe(20);
  });

  it("retorna variação negativa quando current < previous", () => {
    expect(variationPct(80, 100)).toBe(-20);
  });

  it("retorna 0 quando iguais", () => {
    expect(variationPct(100, 100)).toBe(0);
  });

  it("retorna null quando previous é zero (divisão por zero)", () => {
    expect(variationPct(50, 0)).toBeNull();
    expect(variationPct(0, 0)).toBeNull();
  });

  it("retorna -100 quando current vai a zero", () => {
    expect(variationPct(0, 100)).toBe(-100);
  });
});

describe("resolveCustom", () => {
  it("aceita YYYY-MM-DD válidos", () => {
    const p = resolveCustom("2026-02-01", "2026-02-28");
    expect(p).not.toBeNull();
    expect(p!.preset).toBe("custom");
    expect(p!.from.getDate()).toBe(1);
    expect(p!.from.getMonth()).toBe(1);
    expect(p!.to.getDate()).toBe(28);
    expect(p!.label).toContain("01/02/2026");
  });

  it("from inclui o dia inteiro (00:00) e to inclui o dia inteiro (23:59)", () => {
    const p = resolveCustom("2026-03-10", "2026-03-10")!;
    expect(p.from.getHours()).toBe(0);
    expect(p.to.getHours()).toBe(23);
  });

  it("retorna null quando formato inválido", () => {
    expect(resolveCustom("2026/02/01", "2026/02/28")).toBeNull();
    expect(resolveCustom("01-02-2026", "28-02-2026")).toBeNull();
    expect(resolveCustom("", "")).toBeNull();
  });

  it("retorna null quando from > to", () => {
    expect(resolveCustom("2026-03-01", "2026-02-01")).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { isOverdue, OVERDUE_GRACE_DAYS, overdueCutoff } from "../overdue";

const D = (s: string) => new Date(s);

describe("regra de inadimplência (carência de 2 dias)", () => {
  it("a carência é de 2 dias", () => {
    expect(OVERDUE_GRACE_DAYS).toBe(2);
  });

  // Cenário do Bruno: vencimento dia 18; hoje varia.
  const due = D("2026-06-18T00:00:00");

  it("vence hoje (dia 18) → NÃO é inadimplente", () => {
    expect(isOverdue(due, D("2026-06-18T10:00:00"))).toBe(false);
  });

  it("venceu ontem (consulta dia 19) → NÃO é inadimplente (carência)", () => {
    expect(isOverdue(due, D("2026-06-19T10:00:00"))).toBe(false);
  });

  it("2 dias após (dia 20) → É inadimplente", () => {
    expect(isOverdue(due, D("2026-06-20T08:00:00"))).toBe(true);
  });

  it("vencimento futuro nunca é inadimplente", () => {
    expect(isOverdue(D("2026-07-01"), D("2026-06-18"))).toBe(false);
  });

  it("null/sem vencimento nunca é inadimplente", () => {
    expect(isOverdue(null, D("2026-06-20"))).toBe(false);
    expect(isOverdue(undefined, D("2026-06-20"))).toBe(false);
  });

  it("ignora a hora do vencimento (vence 18 às 23h, dia 20 já é inadimplente)", () => {
    expect(isOverdue(D("2026-06-18T23:30:00"), D("2026-06-20T07:00:00"))).toBe(true);
    // e no dia 19 ainda não
    expect(isOverdue(D("2026-06-18T23:30:00"), D("2026-06-19T23:59:00"))).toBe(false);
  });

  it("overdueCutoff é o início de (hoje - 1 dia) com carência 2", () => {
    // dia 20 → cutoff = 19 00:00; vencimentos < 19 00:00 (ou seja, dia 18-) são inadimplentes
    expect(overdueCutoff(D("2026-06-20T15:00:00")).getTime()).toBe(
      D("2026-06-19T00:00:00").getTime(),
    );
  });
});

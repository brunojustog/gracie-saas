import { describe, expect, it } from "vitest";

import {
  countActiveAt,
  isActiveAt,
  lastMonthStarts,
  professorShareForSession,
  ratePct,
} from "../quadro";

describe("professorShareForSession — repasse da aula particular (v1.2-CB)", () => {
  it("60% do valor da aula, sobre o contrato original", () => {
    // 8 aulas por R$1500 = R$187,50/aula → 60% = R$112,50
    expect(
      professorShareForSession({ value: 1500, totalClasses: 8, paymentMethod: "PIX" }),
    ).toBe(112.5);
  });

  it("cartão de crédito aplica 90% (taxa da maquininha)", () => {
    expect(
      professorShareForSession({ value: 1500, totalClasses: 8, paymentMethod: "CREDIT_CARD" }),
    ).toBe(101.25);
  });

  it("renovação NÃO dilui: usa as aulas do contrato original (total − renovadas)", () => {
    // Pacote 8× R$1500, renovado +8 (total 16). O valor/aula continua R$187,50
    // (1500÷8), não R$93,75 (1500÷16). No cartão → R$101,25, não R$50,63.
    expect(
      professorShareForSession({
        value: 1500,
        totalClasses: 16,
        paymentMethod: "CREDIT_CARD",
        renewals: [{ classesAdded: 8 }],
      }),
    ).toBe(101.25);
  });

  it("várias renovações seguem constantes", () => {
    expect(
      professorShareForSession({
        value: 1500,
        totalClasses: 24,
        paymentMethod: "PIX",
        renewals: [{ classesAdded: 8 }, { classesAdded: 8 }],
      }),
    ).toBe(112.5);
  });

  it("promoção de indicação paga valor fixo (R$70)", () => {
    expect(
      professorShareForSession({ value: 0, totalClasses: 4, paymentMethod: null, referralPromo: true }),
    ).toBe(70);
  });

  it("contrato original <= 0 → 0 (sem divisão por zero)", () => {
    expect(
      professorShareForSession({
        value: 1500,
        totalClasses: 8,
        paymentMethod: "PIX",
        renewals: [{ classesAdded: 8 }],
      }),
    ).toBe(0);
  });
});

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

describe("isActiveAt — ativo = status ACTIVE (congelado/cancelado não conta)", () => {
  const D = (s: string) => new Date(s);
  const ref = D("2026-06-18");

  it("matrícula ativa simples conta", () => {
    expect(
      isActiveAt({ enrolledAt: D("2026-01-01"), canceledAt: null, cancelRequestedAt: null, status: "ACTIVE", suspendedAt: null }, ref),
    ).toBe(true);
  });

  it("matriculada depois da data não conta", () => {
    expect(
      isActiveAt({ enrolledAt: D("2026-07-01"), canceledAt: null, cancelRequestedAt: null, status: "ACTIVE", suspendedAt: null }, ref),
    ).toBe(false);
  });

  it("cancelada até a data não conta", () => {
    expect(
      isActiveAt({ enrolledAt: D("2026-01-01"), canceledAt: D("2026-05-01"), cancelRequestedAt: null, status: "CANCELED", suspendedAt: null }, ref),
    ).toBe(false);
  });

  it("cancelamento SOLICITADO até a data não conta (sai pela data da solicitação)", () => {
    expect(
      isActiveAt({ enrolledAt: D("2026-01-01"), canceledAt: null, cancelRequestedAt: D("2026-05-01"), status: "CANCEL_REQUESTED", suspendedAt: null }, ref),
    ).toBe(false);
  });

  it("cancelamento SOLICITADO depois da data ainda conta como ativa naquele momento", () => {
    expect(
      isActiveAt({ enrolledAt: D("2026-01-01"), canceledAt: null, cancelRequestedAt: D("2026-06-25"), status: "CANCEL_REQUESTED", suspendedAt: null }, ref),
    ).toBe(true);
  });

  it("congelada (SUSPENDED) antes da data NÃO conta — era o bug do gap", () => {
    expect(
      isActiveAt({ enrolledAt: D("2026-01-01"), canceledAt: null, cancelRequestedAt: null, status: "SUSPENDED", suspendedAt: D("2026-05-10") }, ref),
    ).toBe(false);
  });

  it("congelada DEPOIS da data ainda contava como ativa naquele momento", () => {
    expect(
      isActiveAt({ enrolledAt: D("2026-01-01"), canceledAt: null, cancelRequestedAt: null, status: "SUSPENDED", suspendedAt: D("2026-06-25") }, ref),
    ).toBe(true);
  });

  it("countActiveAt reconcilia: 2 ativas + 1 congelada = 2", () => {
    const enr = [
      { enrolledAt: D("2026-01-01"), canceledAt: null, cancelRequestedAt: null, status: "ACTIVE", suspendedAt: null },
      { enrolledAt: D("2026-02-01"), canceledAt: null, cancelRequestedAt: null, status: "ACTIVE", suspendedAt: null },
      { enrolledAt: D("2026-03-01"), canceledAt: null, cancelRequestedAt: null, status: "SUSPENDED", suspendedAt: D("2026-04-01") },
    ];
    expect(countActiveAt(enr, ref)).toBe(2);
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

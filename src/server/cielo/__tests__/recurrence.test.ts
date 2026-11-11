import { describe, expect, it } from "vitest";

import { detectCardBrand, isLuhnValid } from "@/lib/card-brand";

import { buildRecurrenceBody, describeError } from "../client";
import {
  buildMerchantOrderId,
  isFailedStatus,
  isPaidStatus,
  parseCieloDate,
  planFirstCharge,
  sanitizeCustomerName,
  sanitizeSoftDescriptor,
  toCents,
} from "../recurrence";

describe("planFirstCharge", () => {
  const today = new Date(2026, 10, 11, 15, 0); // 11/11/2026

  it("cobra já quando não há vencimento", () => {
    expect(planFirstCharge(null, today)).toEqual({ authorizeNow: true });
  });
  it("cobra já quando vence hoje (qualquer hora)", () => {
    expect(planFirstCharge(new Date(2026, 10, 11, 1, 0), today)).toEqual({ authorizeNow: true });
  });
  it("cobra já quando está atrasado", () => {
    expect(planFirstCharge(new Date(2026, 9, 20, 12), today)).toEqual({ authorizeNow: true });
  });
  it("agenda pro próximo vencimento futuro", () => {
    expect(planFirstCharge(new Date(2026, 10, 25, 12), today)).toEqual({
      authorizeNow: false,
      startDate: "2026-11-25",
    });
  });
});

describe("buildRecurrenceBody", () => {
  const base = {
    merchantOrderId: "GB123",
    customerName: "Joao Silva",
    amountCents: 25000,
    cardToken: "235f6297-4989-4a99-9593-057619c4df3d",
    brand: "Visa",
  };

  it("sempre captura e usa 1 parcela mensal", () => {
    const b = buildRecurrenceBody({ ...base, authorizeNow: true });
    expect(b.Payment.Capture).toBe(true);
    expect(b.Payment.Installments).toBe(1);
    expect(b.Payment.RecurrentPayment).toEqual({ AuthorizeNow: true, Interval: "Monthly" });
    expect(b.Payment.CreditCard).toEqual({ CardToken: base.cardToken, Brand: "Visa" });
  });
  it("manda StartDate só quando agenda", () => {
    const b = buildRecurrenceBody({ ...base, authorizeNow: false, startDate: "2026-11-25", softDescriptor: "GRACIEBARRA" });
    expect(b.Payment.RecurrentPayment).toEqual({ AuthorizeNow: false, StartDate: "2026-11-25", Interval: "Monthly" });
    expect(b.Payment.SoftDescriptor).toBe("GRACIEBARRA");
  });
  it("nunca inclui dados do cartão em claro", () => {
    const json = JSON.stringify(buildRecurrenceBody({ ...base, authorizeNow: true }));
    expect(json).not.toMatch(/CardNumber|SecurityCode|Holder/);
  });
});

describe("sanitizers", () => {
  it("toCents arredonda", () => {
    expect(toCents(249.9)).toBe(24990);
    expect(toCents("0.1")).toBe(10);
  });
  it("MerchantOrderId só alfanumérico e ≤ 50", () => {
    const id = buildMerchantOrderId("cm_abc-123".repeat(10), new Date(0));
    expect(id).toMatch(/^[a-zA-Z0-9]+$/);
    expect(id.length).toBeLessThanOrEqual(50);
  });
  it("nome do cliente sem acento/dígito", () => {
    expect(sanitizeCustomerName("João D'Ávila 2º")).toBe("Joao D Avila");
    expect(sanitizeCustomerName("123")).toBe("Aluno");
  });
  it("soft descriptor ≤ 13, sem espaço", () => {
    expect(sanitizeSoftDescriptor("Gracie Barra Anália")).toBe("GRACIEBARRAAN");
    expect(sanitizeSoftDescriptor("")).toBeUndefined();
  });
});

describe("status e datas", () => {
  it("só PaymentConfirmed (2) dá baixa", () => {
    expect(isPaidStatus(2)).toBe(true);
    expect(isPaidStatus(1)).toBe(false);
    expect(isPaidStatus(20)).toBe(false);
  });
  it("Denied/Aborted são falha", () => {
    expect(isFailedStatus(3)).toBe(true);
    expect(isFailedStatus(13)).toBe(true);
    expect(isFailedStatus(2)).toBe(false);
  });
  it("data da Cielo é horário de Brasília", () => {
    expect(parseCieloDate("2026-11-11 09:55:00")?.toISOString()).toBe("2026-11-11T12:55:00.000Z");
    expect(parseCieloDate(null)).toBeNull();
  });
  it("descreve erro em lista da Cielo", () => {
    expect(describeError([{ Code: 127, Message: "You must provide CreditCard Number" }], 400)).toBe(
      "127: You must provide CreditCard Number",
    );
    expect(describeError(undefined, 401)).toMatch(/credenciais/);
  });
});

describe("card-brand", () => {
  it("detecta bandeiras", () => {
    expect(detectCardBrand("4111 1111 1111 1111")).toBe("Visa");
    expect(detectCardBrand("5502095822650000")).toBe("Master");
    expect(detectCardBrand("2221000000000009")).toBe("Master");
    expect(detectCardBrand("378282246310005")).toBe("Amex");
    expect(detectCardBrand("6362970000457013")).toBe("Elo");
    expect(detectCardBrand("6062825624254001")).toBe("Hipercard");
    expect(detectCardBrand("12")).toBeNull();
  });
  it("valida Luhn", () => {
    expect(isLuhnValid("4111111111111111")).toBe(true);
    expect(isLuhnValid("4024007153763191")).toBe(false);
  });
});

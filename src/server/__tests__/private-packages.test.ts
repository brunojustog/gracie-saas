import { describe, expect, it } from "vitest";

import { countCompleted, deriveStatus } from "../private-packages";

describe("countCompleted", () => {
  it("conta só sessões com completedAt", () => {
    expect(
      countCompleted([
        { completedAt: new Date() },
        { completedAt: null },
        { completedAt: new Date() },
      ]),
    ).toBe(2);
    expect(countCompleted([])).toBe(0);
  });
});

describe("deriveStatus", () => {
  it("vira COMPLETED quando concluídas >= contratadas", () => {
    expect(deriveStatus("ACTIVE", 10, 10)).toBe("COMPLETED");
    expect(deriveStatus("ACTIVE", 11, 10)).toBe("COMPLETED");
  });

  it("continua ACTIVE enquanto faltam aulas", () => {
    expect(deriveStatus("ACTIVE", 6, 10)).toBe("ACTIVE");
    expect(deriveStatus("ACTIVE", 0, 4)).toBe("ACTIVE");
  });

  it("reabre (COMPLETED→ACTIVE) se aumentar o total contratado", () => {
    expect(deriveStatus("COMPLETED", 10, 12)).toBe("ACTIVE");
  });

  it("cancelado nunca muda automaticamente", () => {
    expect(deriveStatus("CANCELED", 10, 10)).toBe("CANCELED");
    expect(deriveStatus("CANCELED", 0, 10)).toBe("CANCELED");
  });
});

import { describe, expect, it } from "vitest";

import {
  NOVO_LEAD_TEMPLATES,
  NOVO_LEAD_TOTAL_STEPS,
  firstName,
  renderTemplate,
} from "../templates";

describe("firstName", () => {
  it("extrai primeiro nome", () => {
    expect(firstName("Maria Silva Costa")).toBe("Maria");
    expect(firstName("João")).toBe("João");
  });

  it("colapsa espaços extras", () => {
    expect(firstName("   Pedro   da    Silva")).toBe("Pedro");
  });

  it("retorna fallback pra null/empty", () => {
    expect(firstName(null)).toBe("tudo bem");
    expect(firstName("")).toBe("tudo bem");
    expect(firstName("   ")).toBe("tudo bem");
  });
});

describe("renderTemplate", () => {
  it("substitui placeholders conhecidos", () => {
    const out = renderTemplate("Oi {nome}, {atendente} da {academia}.", {
      nome: "Maria",
      atendente: "Evelyn",
      academia: "Gracie Barra Anália Franco",
    });
    expect(out).toBe("Oi Maria, Evelyn da Gracie Barra Anália Franco.");
  });

  it("deixa placeholders desconhecidos intactos", () => {
    const out = renderTemplate("Oi {nome}, ver {planos}.", {
      nome: "Maria",
      atendente: "x",
      academia: "x",
    });
    expect(out).toBe("Oi Maria, ver {planos}.");
  });

  it("substitui múltiplas ocorrências do mesmo placeholder", () => {
    const out = renderTemplate("{nome}, {nome}, {nome}!", {
      nome: "X",
      atendente: "y",
      academia: "z",
    });
    expect(out).toBe("X, X, X!");
  });
});

describe("NOVO_LEAD_TEMPLATES", () => {
  it("tem 8 mensagens", () => {
    expect(NOVO_LEAD_TEMPLATES).toHaveLength(NOVO_LEAD_TOTAL_STEPS);
    expect(NOVO_LEAD_TOTAL_STEPS).toBe(8);
  });

  it("steps são 1..8 sem gaps", () => {
    const steps = NOVO_LEAD_TEMPLATES.map((t) => t.step).sort();
    expect(steps).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("M1 e M4 usam placeholder {nome}, M1 e M4 usam {academia}", () => {
    expect(NOVO_LEAD_TEMPLATES[0]!.body).toContain("{nome}");
    expect(NOVO_LEAD_TEMPLATES[0]!.body).toContain("{academia}");
    expect(NOVO_LEAD_TEMPLATES[3]!.body).toContain("{academia}");
  });

  it("todo body é não-vazio", () => {
    for (const t of NOVO_LEAD_TEMPLATES) {
      expect(t.body.trim().length).toBeGreaterThan(20);
    }
  });
});

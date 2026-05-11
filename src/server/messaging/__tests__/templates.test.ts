import { describe, expect, it } from "vitest";

import {
  ALL_TEMPLATES,
  APPOINTMENT_TEMPLATES,
  ATTENDANCE_TEMPLATES,
  WELCOME_KEYS,
  WELCOME_LAST_KEY,
  WELCOME_TEMPLATES,
  firstName,
  formatBrDate,
  formatBrTime,
  getTemplate,
  renderTemplate,
} from "../templates";

describe("firstName", () => {
  it("extrai primeiro nome", () => {
    expect(firstName("Maria Silva Costa")).toBe("Maria");
    expect(firstName("   Pedro   da   Silva")).toBe("Pedro");
  });
  it("fallback pra null/empty", () => {
    expect(firstName(null)).toBe("tudo bem");
    expect(firstName("")).toBe("tudo bem");
    expect(firstName("   ")).toBe("tudo bem");
  });
});

describe("renderTemplate", () => {
  it("substitui {nome} {atendente} {academia}", () => {
    expect(
      renderTemplate("Oi {nome}, {atendente} da {academia}.", {
        nome: "Maria",
        atendente: "Evelyn",
        academia: "Gracie Barra Anália Franco",
      }),
    ).toBe("Oi Maria, Evelyn da Gracie Barra Anália Franco.");
  });

  it("substitui {dia} {horario} {modalidade} quando presentes", () => {
    expect(
      renderTemplate("Aula em {dia} às {horario} ({modalidade}).", {
        nome: "X",
        atendente: "y",
        academia: "z",
        dia: "10/03/2026 (terça-feira)",
        horario: "18:30",
        modalidade: "GBK",
      }),
    ).toBe("Aula em 10/03/2026 (terça-feira) às 18:30 (GBK).");
  });

  it("deixa placeholder ausente intacto", () => {
    expect(
      renderTemplate("Oi {nome}, {planos}.", {
        nome: "X",
        atendente: "y",
        academia: "z",
      }),
    ).toBe("Oi X, {planos}.");
  });

  it("vazio é tratado como ausente", () => {
    expect(
      renderTemplate("X {modalidade} Y", {
        nome: "n",
        atendente: "a",
        academia: "ac",
        modalidade: "",
      }),
    ).toBe("X {modalidade} Y");
  });
});

describe("Welcome templates", () => {
  it("8 mensagens com keys 'welcome.m1'..'welcome.m8'", () => {
    expect(WELCOME_TEMPLATES).toHaveLength(8);
    expect(WELCOME_KEYS).toEqual([
      "welcome.m1",
      "welcome.m2",
      "welcome.m3",
      "welcome.m4",
      "welcome.m5",
      "welcome.m6",
      "welcome.m7",
      "welcome.m8",
    ]);
    expect(WELCOME_LAST_KEY).toBe("welcome.m8");
  });
});

describe("Appointment templates", () => {
  it("inclui confirm + 3 lembretes + 3 no-show", () => {
    const keys = APPOINTMENT_TEMPLATES.map((t) => t.key);
    expect(keys).toContain("appointment.confirm");
    expect(keys).toContain("appointment.d-1");
    expect(keys).toContain("appointment.d-0");
    expect(keys).toContain("appointment.1h-before");
    expect(keys).toContain("appointment.no-show-1");
    expect(keys).toContain("appointment.no-show-2");
    expect(keys).toContain("appointment.no-show-3");
  });

  it("confirm cita {dia} e {horario}", () => {
    const t = APPOINTMENT_TEMPLATES.find((x) => x.key === "appointment.confirm")!;
    expect(t.body).toContain("{dia}");
    expect(t.body).toContain("{horario}");
  });
});

describe("Attendance templates", () => {
  it("inclui post", () => {
    expect(ATTENDANCE_TEMPLATES.map((t) => t.key)).toContain("attendance.post");
  });
});

describe("getTemplate", () => {
  it("acha por key", () => {
    expect(getTemplate("welcome.m1")?.key).toBe("welcome.m1");
    expect(getTemplate("appointment.d-1")?.key).toBe("appointment.d-1");
    expect(getTemplate("inexistente.bla")).toBeUndefined();
  });
});

describe("ALL_TEMPLATES", () => {
  it("não tem keys duplicadas", () => {
    const keys = ALL_TEMPLATES.map((t) => t.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("formatBrDate", () => {
  it("formata data em pt-BR com dia da semana", () => {
    const d = new Date(Date.UTC(2026, 4, 11, 14, 0)); // 11/05/2026 11h BRT (uma segunda)
    const s = formatBrDate(d);
    expect(s).toContain("11/05/2026");
    expect(s.toLowerCase()).toContain("segunda-feira");
  });
});

describe("formatBrTime", () => {
  it("formata HH:mm 24h em horário Brasil", () => {
    // 18:30 BRT = 21:30 UTC
    const d = new Date(Date.UTC(2026, 4, 11, 21, 30));
    expect(formatBrTime(d)).toBe("18:30");
  });
});

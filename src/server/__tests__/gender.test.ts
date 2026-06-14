import { describe, expect, it } from "vitest";

import { guessGender } from "../gender";

describe("guessGender", () => {
  it("nomes terminando em 'a' → feminino", () => {
    expect(guessGender("Maria Silva")).toBe("FEMALE");
    expect(guessGender("Bianca Oliveira")).toBe("FEMALE");
    expect(guessGender("ana")).toBe("FEMALE");
  });

  it("nomes masculinos comuns → masculino", () => {
    expect(guessGender("Pedro Barbosa")).toBe("MALE");
    expect(guessGender("Thiago Mendes")).toBe("MALE");
    expect(guessGender("João")).toBe("MALE");
  });

  it("femininos que não terminam em 'a'", () => {
    expect(guessGender("Raquel")).toBe("FEMALE");
    expect(guessGender("Evelyn Santos")).toBe("FEMALE");
    expect(guessGender("Isabel")).toBe("FEMALE");
  });

  it("masculinos que terminam em 'a' (exceções)", () => {
    expect(guessGender("Luca")).toBe("MALE");
    expect(guessGender("Joshua")).toBe("MALE");
  });

  it("usa só o primeiro nome (ignora sobrenome)", () => {
    // sobrenome "Costa" termina em a, mas o primeiro nome manda
    expect(guessGender("Bruno Costa")).toBe("MALE");
  });

  it("vazio/nulo → null (deixa escolher)", () => {
    expect(guessGender("")).toBeNull();
    expect(guessGender("   ")).toBeNull();
    expect(guessGender(null)).toBeNull();
    expect(guessGender(undefined)).toBeNull();
  });

  it("case-insensitive", () => {
    expect(guessGender("MARIA")).toBe("FEMALE");
    expect(guessGender("pedro")).toBe("MALE");
  });
});

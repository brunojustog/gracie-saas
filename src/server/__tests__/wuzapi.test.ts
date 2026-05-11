import { describe, expect, it } from "vitest";

import { toWuzapiPhone } from "../wuzapi";

describe("toWuzapiPhone", () => {
  it("já em formato Wuzapi: passa direto", () => {
    expect(toWuzapiPhone("5511999999999")).toBe("5511999999999");
    expect(toWuzapiPhone("551199999999")).toBe("551199999999"); // 12 dígitos
  });

  it("11 dígitos sem DDI: prefixa 55", () => {
    expect(toWuzapiPhone("11999999999")).toBe("5511999999999");
  });

  it("10 dígitos sem 9 (fixo): prefixa 55", () => {
    expect(toWuzapiPhone("1133334444")).toBe("551133334444");
  });

  it("remove formatação", () => {
    expect(toWuzapiPhone("(11) 99999-9999")).toBe("5511999999999");
    expect(toWuzapiPhone("+55 11 99999-9999")).toBe("5511999999999");
    expect(toWuzapiPhone("11 9.9999-9999")).toBe("5511999999999");
  });

  it("número estranho: retorna só os dígitos", () => {
    expect(toWuzapiPhone("12345")).toBe("12345");
  });
});

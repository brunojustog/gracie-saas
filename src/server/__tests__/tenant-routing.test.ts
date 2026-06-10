import { describe, expect, it } from "vitest";

import {
  ADMIN_SLUG,
  decodeTenantHeader,
  encodeTenantHeader,
  parseTenantFromHost,
} from "../tenant-routing";

describe("parseTenantFromHost", () => {
  it.each([
    ["localhost:3000", { kind: "root" }],
    ["localhost", { kind: "root" }],
    ["app.simplifica.com.br", { kind: "root" }],
    ["simplificaonline.site", { kind: "root" }],
    ["", { kind: "root" }],
    [null, { kind: "root" }],
    [undefined, { kind: "root" }],
  ])("%s → root", (host, expected) => {
    expect(parseTenantFromHost(host as string | null | undefined)).toEqual(expected);
  });

  it.each([
    ["gracie.localhost:3000", "gracie"],
    ["gracie.localhost", "gracie"],
    ["gracie.app.simplifica.com.br", "gracie"],
    ["albanos.app.simplifica.com.br", "albanos"],
    ["amare.app.simplifica.com.br", "amare"],
    ["bgaf.simplificaonline.site", "bgaf"],
  ])("%s → tenant=%s", (host, slug) => {
    expect(parseTenantFromHost(host)).toEqual({ kind: "tenant", slug });
  });

  it.each([
    ["admin.localhost:3000"],
    ["admin.localhost"],
    ["admin.app.simplifica.com.br"],
  ])("%s → admin", (host) => {
    expect(parseTenantFromHost(host)).toEqual({ kind: "admin" });
  });

  it("é case-insensitive (browsers podem mandar host com case misto)", () => {
    expect(parseTenantFromHost("Gracie.LOCALHOST:3000")).toEqual({
      kind: "tenant",
      slug: "gracie",
    });
    expect(parseTenantFromHost("ADMIN.localhost")).toEqual({ kind: "admin" });
  });

  it("rejeita slugs com chars inválidos (defesa contra header forjado)", () => {
    // Underscore não é permitido pela regex.
    expect(parseTenantFromHost("_invalid.localhost")).toEqual({ kind: "root" });
    // Slug terminando em hífen não é permitido.
    expect(parseTenantFromHost("foo-.localhost")).toEqual({ kind: "root" });
    // Espaços, símbolos.
    expect(parseTenantFromHost("foo bar.localhost")).toEqual({ kind: "root" });
  });

  it("aceita slugs válidos com hífen e dígitos", () => {
    expect(parseTenantFromHost("gracie-bjj.localhost")).toEqual({
      kind: "tenant",
      slug: "gracie-bjj",
    });
    expect(parseTenantFromHost("amare2026.localhost")).toEqual({
      kind: "tenant",
      slug: "amare2026",
    });
  });
});

describe("encodeTenantHeader / decodeTenantHeader (roundtrip)", () => {
  it("codifica tenant slug literal", () => {
    expect(encodeTenantHeader({ kind: "tenant", slug: "gracie" })).toBe("gracie");
  });

  it("codifica admin com sentinel", () => {
    expect(encodeTenantHeader({ kind: "admin" })).toBe(ADMIN_SLUG);
    expect(ADMIN_SLUG.startsWith("__")).toBe(true);
  });

  it("codifica root como string vazia", () => {
    expect(encodeTenantHeader({ kind: "root" })).toBe("");
  });

  it("decoda valor vazio/ausente como root", () => {
    expect(decodeTenantHeader(null)).toEqual({ kind: "root" });
    expect(decodeTenantHeader(undefined)).toEqual({ kind: "root" });
    expect(decodeTenantHeader("")).toEqual({ kind: "root" });
  });

  it("decoda sentinel admin", () => {
    expect(decodeTenantHeader(ADMIN_SLUG)).toEqual({ kind: "admin" });
  });

  it("decoda qualquer outra string como tenant slug", () => {
    expect(decodeTenantHeader("gracie")).toEqual({ kind: "tenant", slug: "gracie" });
    expect(decodeTenantHeader("albanos")).toEqual({ kind: "tenant", slug: "albanos" });
  });

  it("é roundtrip pra todos os 3 kinds", () => {
    const cases = [
      { kind: "tenant" as const, slug: "gracie" },
      { kind: "admin" as const },
      { kind: "root" as const },
    ];
    for (const ctx of cases) {
      expect(decodeTenantHeader(encodeTenantHeader(ctx))).toEqual(ctx);
    }
  });
});

// ── v1.1-AF: domínios custom (white-label) ────────────────────────────────

import { customDomainForSlug, parseCustomDomainMap } from "../tenant-routing";

describe("parseCustomDomainMap", () => {
  it("parseia pares host=slug separados por vírgula", () => {
    const map = parseCustomDomainMap(
      "app.gbanaliafranco.com.br=bgaf, Outro.Com.BR=slug2",
    );
    expect(map.get("app.gbanaliafranco.com.br")).toBe("bgaf");
    expect(map.get("outro.com.br")).toBe("slug2"); // normaliza lowercase
    expect(map.size).toBe(2);
  });

  it("env vazio/ausente vira mapa vazio", () => {
    expect(parseCustomDomainMap("").size).toBe(0);
    expect(parseCustomDomainMap(null).size).toBe(0);
    expect(parseCustomDomainMap(undefined).size).toBe(0);
  });

  it("ignora pares malformados", () => {
    const map = parseCustomDomainMap("semigual,=semhost,semslug=,a.com=ok");
    expect(map.size).toBe(1);
    expect(map.get("a.com")).toBe("ok");
  });
});

describe("parseTenantFromHost com domínios custom", () => {
  const custom = parseCustomDomainMap("app.gbanaliafranco.com.br=bgaf");

  it("host custom resolve pro slug mapeado (não pro subdomínio 'app')", () => {
    expect(parseTenantFromHost("app.gbanaliafranco.com.br", custom)).toEqual({
      kind: "tenant",
      slug: "bgaf",
    });
    expect(parseTenantFromHost("app.gbanaliafranco.com.br:443", custom)).toEqual({
      kind: "tenant",
      slug: "bgaf",
    });
  });

  it("custom tem precedência mas não afeta os outros hosts", () => {
    expect(parseTenantFromHost("bgaf.simplificaonline.site", custom)).toEqual({
      kind: "tenant",
      slug: "bgaf",
    });
    expect(parseTenantFromHost("gracie.localhost:3000", custom)).toEqual({
      kind: "tenant",
      slug: "gracie",
    });
  });

  it("sem o mapa, host custom cairia na heurística de subdomínio (errado)", () => {
    // Documenta o porquê do mapa existir: sem ele, "app" viraria slug.
    expect(parseTenantFromHost("app.gbanaliafranco.com.br", new Map())).toEqual({
      kind: "tenant",
      slug: "app",
    });
  });
});

describe("customDomainForSlug", () => {
  const custom = parseCustomDomainMap("app.gbanaliafranco.com.br=bgaf");

  it("acha o domínio do slug (inverso)", () => {
    expect(customDomainForSlug("bgaf", custom)).toBe("app.gbanaliafranco.com.br");
  });

  it("slug sem domínio custom retorna null", () => {
    expect(customDomainForSlug("gracie", custom)).toBeNull();
  });
});

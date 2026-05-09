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

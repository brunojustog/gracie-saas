import { describe, expect, it } from "vitest";

import { buildAdminUrl, buildTenantUrl } from "../tenant-url";

describe("buildTenantUrl — dev (localhost)", () => {
  it("preserva porta + usa http em localhost", () => {
    expect(
      buildTenantUrl({
        slug: "gracie",
        host: "localhost:3000",
      }),
    ).toBe("http://gracie.localhost:3000/dashboard");
  });

  it("permite path customizado", () => {
    expect(
      buildTenantUrl({
        slug: "gracie",
        host: "localhost:3000",
        path: "/leads",
      }),
    ).toBe("http://gracie.localhost:3000/leads");
  });

  it("troca o subdomínio quando o host atual já tem um", () => {
    // Estou em admin.localhost:3000 e quero o link de gracie:
    expect(
      buildTenantUrl({
        slug: "gracie",
        host: "admin.localhost:3000",
      }),
    ).toBe("http://gracie.localhost:3000/dashboard");
  });
});

describe("buildTenantUrl — prod", () => {
  it("usa https + sem porta no domínio raiz", () => {
    expect(
      buildTenantUrl({
        slug: "gracie",
        host: "app.simplifica.com.br",
      }),
    ).toBe("https://gracie.app.simplifica.com.br/dashboard");
  });

  it("respeita x-forwarded-proto quando atrás de proxy", () => {
    // Hetzner + Nginx terminando TLS: o app vê http internamente, mas o
    // proto real vem em x-forwarded-proto. Sem isso, o link ficaria errado.
    expect(
      buildTenantUrl({
        slug: "gracie",
        host: "app.simplifica.com.br",
        forwardedProto: "https",
      }),
    ).toBe("https://gracie.app.simplifica.com.br/dashboard");
  });

  it("troca subdomínio existente em prod", () => {
    expect(
      buildTenantUrl({
        slug: "albanos",
        host: "gracie.app.simplifica.com.br",
        forwardedProto: "https",
      }),
    ).toBe("https://albanos.app.simplifica.com.br/dashboard");
  });
});

describe("buildAdminUrl", () => {
  it("default path é /admin", () => {
    expect(buildAdminUrl({ host: "localhost:3000" })).toBe(
      "http://admin.localhost:3000/admin",
    );
  });

  it("path customizado é respeitado", () => {
    expect(buildAdminUrl({ host: "localhost:3000", path: "/admin/tenants" })).toBe(
      "http://admin.localhost:3000/admin/tenants",
    );
  });

  it("produz URL correta em prod", () => {
    expect(
      buildAdminUrl({
        host: "app.simplifica.com.br",
        forwardedProto: "https",
      }),
    ).toBe("https://admin.app.simplifica.com.br/admin");
  });
});

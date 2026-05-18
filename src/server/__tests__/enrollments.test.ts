import type { TenantUser } from "@prisma/client";

import { describe, expect, it } from "vitest";

import {
  buildEnrollmentListWhere,
  scopedEnrollmentWhere,
} from "../enrollments";

const membershipFactory = (
  overrides: Partial<TenantUser> = {},
): TenantUser => ({
  id: "tu_1",
  tenantId: "tenant_gracie",
  userId: "user_anna",
  role: "SELLER",
  active: true,
  createdAt: new Date(),
  ...overrides,
});

describe("scopedEnrollmentWhere (v1.1-O: sem isolamento por seller)", () => {
  it.each(["ADMIN", "MANAGER", "SELLER"] as const)(
    "%s vê todas as matrículas do tenant",
    (role) => {
      const where = scopedEnrollmentWhere(membershipFactory({ role }));
      expect(where).toEqual({ tenantId: "tenant_gracie" });
      expect(where).not.toHaveProperty("lead");
    },
  );
});

describe("buildEnrollmentListWhere — combinando filtros UI com scope", () => {
  it("ADMIN sem filtros = só tenant", () => {
    const where = buildEnrollmentListWhere(
      membershipFactory({ role: "ADMIN" }),
      {},
    );
    expect(where).toEqual({ tenantId: "tenant_gracie" });
  });

  it("SELLER sem filtros = só tenant (v1.1-O)", () => {
    const where = buildEnrollmentListWhere(
      membershipFactory({ role: "SELLER", userId: "user_anna" }),
      {},
    );
    expect(where).toEqual({ tenantId: "tenant_gracie" });
    expect(where).not.toHaveProperty("lead");
  });

  it("filtro de status é aplicado pra todas as roles", () => {
    const adminW = buildEnrollmentListWhere(
      membershipFactory({ role: "ADMIN" }),
      { status: "CANCELED" },
    );
    const sellerW = buildEnrollmentListWhere(
      membershipFactory({ role: "SELLER" }),
      { status: "CANCELED" },
    );
    expect(adminW.status).toBe("CANCELED");
    expect(sellerW.status).toBe("CANCELED");
  });

  it("search aplica em lead.name (case-insensitive) — mesma forma pra qualquer role", () => {
    const adminW = buildEnrollmentListWhere(
      membershipFactory({ role: "ADMIN" }),
      { search: "Thiago" },
    );
    const sellerW = buildEnrollmentListWhere(
      membershipFactory({ role: "SELLER", userId: "user_anna" }),
      { search: "Thiago" },
    );
    const expectedLead = { name: { contains: "Thiago", mode: "insensitive" } };
    expect(adminW.lead).toEqual(expectedLead);
    expect(sellerW.lead).toEqual(expectedLead);
  });
});

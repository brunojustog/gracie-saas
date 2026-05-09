import type { TenantUser } from "@prisma/client";

import { describe, expect, it } from "vitest";

import { scopedClassWhere } from "../experimental-classes";

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

describe("scopedClassWhere", () => {
  it("ADMIN vê todas as aulas do tenant", () => {
    const where = scopedClassWhere(membershipFactory({ role: "ADMIN" }));
    expect(where).toEqual({ tenantId: "tenant_gracie" });
    expect(where).not.toHaveProperty("lead");
  });

  it("MANAGER vê todas (igual ADMIN)", () => {
    const where = scopedClassWhere(membershipFactory({ role: "MANAGER" }));
    expect(where).toEqual({ tenantId: "tenant_gracie" });
  });

  it("SELLER vê apenas aulas de leads atribuídos a si (filter via lead.assignedSellerId)", () => {
    const where = scopedClassWhere(
      membershipFactory({ role: "SELLER", userId: "user_anna" }),
    );
    expect(where).toEqual({
      tenantId: "tenant_gracie",
      lead: { assignedSellerId: "user_anna" },
    });
  });

  it("SELLER em tenant diferente NÃO enxerga aulas do outro (isolamento)", () => {
    const annaGracie = scopedClassWhere(
      membershipFactory({
        role: "SELLER",
        userId: "anna",
        tenantId: "gracie",
      }),
    );
    const beatrizAlbanos = scopedClassWhere(
      membershipFactory({
        role: "SELLER",
        userId: "beatriz",
        tenantId: "albanos",
      }),
    );
    expect(annaGracie.tenantId).toBe("gracie");
    expect(beatrizAlbanos.tenantId).toBe("albanos");
  });
});

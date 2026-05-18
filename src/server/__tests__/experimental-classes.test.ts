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

describe("scopedClassWhere (v1.1-O: sem isolamento por seller)", () => {
  it.each(["ADMIN", "MANAGER", "SELLER"] as const)(
    "%s vê todas as aulas do tenant",
    (role) => {
      const where = scopedClassWhere(membershipFactory({ role }));
      expect(where).toEqual({ tenantId: "tenant_gracie" });
      expect(where).not.toHaveProperty("lead");
    },
  );

  it("tenants diferentes nunca se cruzam (isolamento de tenant é a única fronteira)", () => {
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

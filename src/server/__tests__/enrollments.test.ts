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

describe("scopedEnrollmentWhere", () => {
  it("ADMIN vê todas as matrículas do tenant", () => {
    const where = scopedEnrollmentWhere(membershipFactory({ role: "ADMIN" }));
    expect(where).toEqual({ tenantId: "tenant_gracie" });
    expect(where).not.toHaveProperty("lead");
  });

  it("MANAGER vê todas (igual ADMIN)", () => {
    const where = scopedEnrollmentWhere(membershipFactory({ role: "MANAGER" }));
    expect(where).toEqual({ tenantId: "tenant_gracie" });
  });

  it("SELLER vê apenas matrículas de leads atribuídos a si", () => {
    const where = scopedEnrollmentWhere(
      membershipFactory({ role: "SELLER", userId: "user_anna" }),
    );
    expect(where).toEqual({
      tenantId: "tenant_gracie",
      lead: { assignedSellerId: "user_anna" },
    });
  });
});

describe("buildEnrollmentListWhere — combinando filtros UI com scope", () => {
  it("ADMIN sem filtros = só tenant", () => {
    const where = buildEnrollmentListWhere(
      membershipFactory({ role: "ADMIN" }),
      {},
    );
    expect(where).toEqual({ tenantId: "tenant_gracie" });
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

  it("search aplica em lead.name (case-insensitive)", () => {
    const where = buildEnrollmentListWhere(
      membershipFactory({ role: "ADMIN" }),
      { search: "Thiago" },
    );
    // SELLER e ADMIN têm shapes diferentes do `lead`. Pra ADMIN, deve
    // aplicar SÓ o filtro de search:
    expect(where.lead).toEqual({
      name: { contains: "Thiago", mode: "insensitive" },
    });
  });

  it("SELLER busca por nome COMBINA com scope (não sobrescreve)", () => {
    const where = buildEnrollmentListWhere(
      membershipFactory({ role: "SELLER", userId: "user_anna" }),
      { search: "Maria" },
    );
    expect(where.lead).toEqual({
      name: { contains: "Maria", mode: "insensitive" },
      assignedSellerId: "user_anna",
    });
  });

  it("SELLER sem search ainda tem o scope aplicado", () => {
    const where = buildEnrollmentListWhere(
      membershipFactory({ role: "SELLER", userId: "user_anna" }),
      {},
    );
    expect(where.lead).toEqual({ assignedSellerId: "user_anna" });
  });
});

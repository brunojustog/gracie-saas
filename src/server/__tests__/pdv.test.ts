import type { TenantUser } from "@prisma/client";

import { describe, expect, it } from "vitest";

import { buildSaleListWhere, scopedSaleWhere } from "../pdv";

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

describe("scopedSaleWhere", () => {
  it("ADMIN vê todas as vendas do tenant", () => {
    const where = scopedSaleWhere(membershipFactory({ role: "ADMIN" }));
    expect(where).toEqual({ tenantId: "tenant_gracie" });
    expect(where).not.toHaveProperty("sellerUserId");
  });

  it("MANAGER vê todas (igual ADMIN)", () => {
    const where = scopedSaleWhere(membershipFactory({ role: "MANAGER" }));
    expect(where).toEqual({ tenantId: "tenant_gracie" });
  });

  it("SELLER vê apenas vendas onde sellerUserId = userId", () => {
    const where = scopedSaleWhere(
      membershipFactory({ role: "SELLER", userId: "user_anna" }),
    );
    expect(where).toEqual({
      tenantId: "tenant_gracie",
      sellerUserId: "user_anna",
    });
  });
});

describe("buildSaleListWhere — combina filtros UI com scope", () => {
  it("ADMIN sem filtros = só tenant", () => {
    const where = buildSaleListWhere(
      membershipFactory({ role: "ADMIN" }),
      {},
    );
    expect(where).toEqual({ tenantId: "tenant_gracie" });
  });

  it("filtro de paymentMethod é aplicado pra todas as roles", () => {
    const adminW = buildSaleListWhere(
      membershipFactory({ role: "ADMIN" }),
      { paymentMethod: "PIX" },
    );
    const sellerW = buildSaleListWhere(
      membershipFactory({ role: "SELLER" }),
      { paymentMethod: "PIX" },
    );
    expect(adminW.paymentMethod).toBe("PIX");
    expect(sellerW.paymentMethod).toBe("PIX");
  });

  it("filtro de período aplica gte/lte no paidAt", () => {
    const from = new Date("2026-05-01");
    const to = new Date("2026-05-31");
    const where = buildSaleListWhere(
      membershipFactory({ role: "ADMIN" }),
      { from, to },
    );
    expect(where.paidAt).toEqual({ gte: from, lte: to });
  });

  it("filtro sellerUserId é honrado para ADMIN/MANAGER", () => {
    const where = buildSaleListWhere(
      membershipFactory({ role: "ADMIN" }),
      { sellerUserId: "user_evelyn" },
    );
    expect(where.sellerUserId).toBe("user_evelyn");
  });

  it("SELLER tentando filtrar por outra vendedora — scope sobrescreve (vê só as próprias)", () => {
    const where = buildSaleListWhere(
      membershipFactory({ role: "SELLER", userId: "user_anna" }),
      { sellerUserId: "user_evelyn" },
    );
    // O spread do scope vem por último em buildSaleListWhere — ganha
    expect(where.sellerUserId).toBe("user_anna");
  });

  it("filtro customerLeadId é aplicado", () => {
    const where = buildSaleListWhere(
      membershipFactory({ role: "ADMIN" }),
      { customerLeadId: "lead_thiago" },
    );
    expect(where.customerLeadId).toBe("lead_thiago");
  });
});

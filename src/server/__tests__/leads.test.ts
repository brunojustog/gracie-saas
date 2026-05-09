import type { TenantUser } from "@prisma/client";

import { describe, expect, it } from "vitest";

import { buildKanbanWhere, scopedLeadWhere } from "../leads";

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

describe("scopedLeadWhere", () => {
  it("ADMIN vê todos os leads do tenant", () => {
    const where = scopedLeadWhere(membershipFactory({ role: "ADMIN" }));
    expect(where).toEqual({ tenantId: "tenant_gracie" });
    expect(where).not.toHaveProperty("assignedSellerId");
  });

  it("MANAGER vê todos os leads do tenant (igual ADMIN)", () => {
    const where = scopedLeadWhere(membershipFactory({ role: "MANAGER" }));
    expect(where).toEqual({ tenantId: "tenant_gracie" });
    expect(where).not.toHaveProperty("assignedSellerId");
  });

  it("SELLER vê APENAS leads atribuídos a si", () => {
    const where = scopedLeadWhere(membershipFactory({ role: "SELLER", userId: "user_anna" }));
    expect(where).toEqual({
      tenantId: "tenant_gracie",
      assignedSellerId: "user_anna",
    });
  });

  it("SELLERs de tenants diferentes nunca enxergam um o outro (isolamento)", () => {
    const annaGracie = scopedLeadWhere(
      membershipFactory({ role: "SELLER", userId: "anna", tenantId: "gracie" }),
    );
    const beatrizAlbanos = scopedLeadWhere(
      membershipFactory({ role: "SELLER", userId: "beatriz", tenantId: "albanos" }),
    );
    expect(annaGracie.tenantId).toBe("gracie");
    expect(beatrizAlbanos.tenantId).toBe("albanos");
    expect(annaGracie.assignedSellerId).not.toBe(beatrizAlbanos.assignedSellerId);
  });
});

describe("buildKanbanWhere — combinando filtros UI com scope", () => {
  it("ADMIN sem filtros = só tenant", () => {
    const where = buildKanbanWhere(membershipFactory({ role: "ADMIN" }), {});
    expect(where).toEqual({ tenantId: "tenant_gracie" });
  });

  it("search aplica OR em name/phone/email com case-insensitive em texto", () => {
    const where = buildKanbanWhere(membershipFactory({ role: "ADMIN" }), {
      search: "maria",
    });
    expect(where.OR).toEqual([
      { name: { contains: "maria", mode: "insensitive" } },
      { phone: { contains: "maria" } },
      { email: { contains: "maria", mode: "insensitive" } },
    ]);
  });

  it("search vazio/whitespace é ignorado", () => {
    const where = buildKanbanWhere(membershipFactory({ role: "ADMIN" }), {
      search: "   ",
    });
    expect(where).not.toHaveProperty("OR");
  });

  it("filtro de modalityId é aplicado pra todos os roles", () => {
    const adminW = buildKanbanWhere(membershipFactory({ role: "ADMIN" }), {
      modalityId: "mod_gb1",
    });
    const sellerW = buildKanbanWhere(membershipFactory({ role: "SELLER" }), {
      modalityId: "mod_gb1",
    });
    expect(adminW.modalityId).toBe("mod_gb1");
    expect(sellerW.modalityId).toBe("mod_gb1");
  });

  it("ADMIN pode filtrar por assignedSellerId arbitrário", () => {
    const where = buildKanbanWhere(membershipFactory({ role: "ADMIN" }), {
      assignedSellerId: "user_evelyn",
    });
    expect(where.assignedSellerId).toBe("user_evelyn");
  });

  it("SELLER tentando passar assignedSellerId de outra pessoa NÃO escapa do scope", () => {
    // Cenário: Anna (SELLER) tenta mexer no querystring pra ver leads da Evelyn.
    // O filtro UI seria respeitado por buildKanbanWhere? NÃO — scope vence.
    const where = buildKanbanWhere(
      membershipFactory({ role: "SELLER", userId: "user_anna" }),
      { assignedSellerId: "user_evelyn" },
    );
    // O filtro UI é simplesmente descartado nesse caso.
    expect(where.assignedSellerId).toBe("user_anna");
  });
});

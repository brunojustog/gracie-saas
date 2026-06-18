import type { TenantUser } from "@prisma/client";

import { describe, expect, it } from "vitest";

import { buildKanbanWhere, phoneSuffix, scopedLeadWhere } from "../leads";

describe("phoneSuffix (dedup cross-canal v1.1-AS)", () => {
  it("extrai os últimos 8 dígitos ignorando máscara e DDI/DDD", () => {
    expect(phoneSuffix("(11) 98888-7777")).toBe("88887777");
    expect(phoneSuffix("+55 11 98888-7777")).toBe("88887777");
    expect(phoneSuffix("11988887777")).toBe("88887777");
  });

  it("mesmo número em formatos diferentes gera o mesmo sufixo", () => {
    expect(phoneSuffix("+55 (11) 98888-7777")).toBe(phoneSuffix("11 98888 7777"));
  });

  it("telefone curto/ausente vira null (não deduplica)", () => {
    expect(phoneSuffix("1234")).toBeNull();
    expect(phoneSuffix("")).toBeNull();
    expect(phoneSuffix(null)).toBeNull();
    expect(phoneSuffix(undefined)).toBeNull();
  });
});

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

describe("scopedLeadWhere (v1.1-O: sem isolamento por seller; v1.1-W: soft delete)", () => {
  it.each(["ADMIN", "MANAGER", "SELLER"] as const)(
    "%s vê todos os leads do tenant (não-deletados por padrão)",
    (role) => {
      const where = scopedLeadWhere(membershipFactory({ role }));
      expect(where).toEqual({ tenantId: "tenant_gracie", deletedAt: null });
      expect(where).not.toHaveProperty("assignedSellerId");
    },
  );

  it("includeDeleted: true mostra também os excluídos (uso administrativo)", () => {
    const where = scopedLeadWhere(membershipFactory({ role: "ADMIN" }), {
      includeDeleted: true,
    });
    expect(where).toEqual({ tenantId: "tenant_gracie" });
    expect(where).not.toHaveProperty("deletedAt");
  });

  it("tenants diferentes nunca se cruzam (isolamento de tenant é a única fronteira)", () => {
    const annaGracie = scopedLeadWhere(
      membershipFactory({ role: "SELLER", userId: "anna", tenantId: "gracie" }),
    );
    const beatrizAlbanos = scopedLeadWhere(
      membershipFactory({ role: "SELLER", userId: "beatriz", tenantId: "albanos" }),
    );
    expect(annaGracie.tenantId).toBe("gracie");
    expect(beatrizAlbanos.tenantId).toBe("albanos");
  });
});

describe("buildKanbanWhere — combinando filtros UI com scope", () => {
  it("ADMIN sem filtros = só tenant (não-deletados)", () => {
    const where = buildKanbanWhere(membershipFactory({ role: "ADMIN" }), {});
    expect(where).toEqual({ tenantId: "tenant_gracie", deletedAt: null });
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

  it("assignedSellerId arbitrário é honrado pra qualquer role (v1.1-O)", () => {
    const adminW = buildKanbanWhere(membershipFactory({ role: "ADMIN" }), {
      assignedSellerId: "user_evelyn",
    });
    const sellerW = buildKanbanWhere(
      membershipFactory({ role: "SELLER", userId: "user_anna" }),
      { assignedSellerId: "user_evelyn" },
    );
    expect(adminW.assignedSellerId).toBe("user_evelyn");
    expect(sellerW.assignedSellerId).toBe("user_evelyn");
  });
});

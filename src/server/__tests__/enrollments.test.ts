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

  it("filtro de status (visão) vira OR de fragmentos", () => {
    const w = buildEnrollmentListWhere(membershipFactory({ role: "ADMIN" }), {
      statusViews: ["CANCELADA"],
    });
    expect(w.OR).toEqual([{ status: "CANCELED" }]);
  });

  it("congelada = ACTIVE + suspendedAt != null; judicial = status JUDICIAL", () => {
    const w = buildEnrollmentListWhere(membershipFactory({ role: "ADMIN" }), {
      statusViews: ["CONGELADA", "JUDICIAL"],
    });
    expect(w.OR).toEqual([
      { status: "ACTIVE", suspendedAt: { not: null } },
      { status: "JUDICIAL" },
    ]);
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

  it("multi-seleção de plano vira planId IN [...]", () => {
    const where = buildEnrollmentListWhere(membershipFactory({ role: "ADMIN" }), {
      planIds: ["plan_anual", "plan_mensal"],
    });
    expect(where.planId).toEqual({ in: ["plan_anual", "plan_mensal"] });
  });

  it("multi-seleção de pagamento vira paymentMethod IN [...]", () => {
    const where = buildEnrollmentListWhere(membershipFactory({ role: "ADMIN" }), {
      paymentMethods: ["PIX", "CREDIT_CARD"],
    });
    expect(where.paymentMethod).toEqual({ in: ["PIX", "CREDIT_CARD"] });
  });

  it("filtros combinados (modality + plan + payment) coexistem", () => {
    const where = buildEnrollmentListWhere(membershipFactory({ role: "ADMIN" }), {
      modalityIds: ["mod_jiujitsu"],
      planIds: ["plan_mensal"],
      paymentMethods: ["BOLETO"],
    });
    expect(where).toMatchObject({
      tenantId: "tenant_gracie",
      modalityId: { in: ["mod_jiujitsu"] },
      planId: { in: ["plan_mensal"] },
      paymentMethod: { in: ["BOLETO"] },
    });
  });

  it("multi-seleção de modalidade vira modalityId IN [...]", () => {
    const where = buildEnrollmentListWhere(membershipFactory({ role: "ADMIN" }), {
      modalityIds: ["gb1", "gbf"],
    });
    expect(where.modalityId).toEqual({ in: ["gb1", "gbf"] });
  });

  it("filtro de sexo recai em lead.gender", () => {
    const where = buildEnrollmentListWhere(membershipFactory({ role: "ADMIN" }), {
      gender: "FEMALE",
    });
    expect(where.lead).toMatchObject({ gender: "FEMALE" });
  });

  it("sexo + busca coexistem no mesmo objeto lead", () => {
    const where = buildEnrollmentListWhere(membershipFactory({ role: "ADMIN" }), {
      gender: "MALE",
      search: "Pedro",
    });
    expect(where.lead).toEqual({
      gender: "MALE",
      name: { contains: "Pedro", mode: "insensitive" },
    });
  });
});

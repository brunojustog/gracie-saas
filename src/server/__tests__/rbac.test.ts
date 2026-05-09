import { describe, expect, it } from "vitest";

import { ROLE_RANK, roleAtLeast } from "../rbac";

describe("ROLE_RANK ordering", () => {
  it("ADMIN > MANAGER > SELLER", () => {
    expect(ROLE_RANK.ADMIN).toBeGreaterThan(ROLE_RANK.MANAGER);
    expect(ROLE_RANK.MANAGER).toBeGreaterThan(ROLE_RANK.SELLER);
  });

  it("nenhum role tem rank zero ou negativo (regressão contra reset acidental)", () => {
    expect(ROLE_RANK.ADMIN).toBeGreaterThan(0);
    expect(ROLE_RANK.MANAGER).toBeGreaterThan(0);
    expect(ROLE_RANK.SELLER).toBeGreaterThan(0);
  });
});

describe("roleAtLeast", () => {
  it("ADMIN passa em qualquer requisito", () => {
    expect(roleAtLeast("ADMIN", "ADMIN")).toBe(true);
    expect(roleAtLeast("ADMIN", "MANAGER")).toBe(true);
    expect(roleAtLeast("ADMIN", "SELLER")).toBe(true);
  });

  it("MANAGER passa em MANAGER e SELLER, não em ADMIN", () => {
    expect(roleAtLeast("MANAGER", "ADMIN")).toBe(false);
    expect(roleAtLeast("MANAGER", "MANAGER")).toBe(true);
    expect(roleAtLeast("MANAGER", "SELLER")).toBe(true);
  });

  it("SELLER só passa em SELLER", () => {
    expect(roleAtLeast("SELLER", "ADMIN")).toBe(false);
    expect(roleAtLeast("SELLER", "MANAGER")).toBe(false);
    expect(roleAtLeast("SELLER", "SELLER")).toBe(true);
  });
});

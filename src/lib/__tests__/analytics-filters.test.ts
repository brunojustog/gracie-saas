import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  parseDashboardFilters,
} from "../analytics-filters";

describe("parseDashboardFilters", () => {
  it("retorna vazio quando nada vem", () => {
    expect(parseDashboardFilters({})).toEqual({});
  });

  it("aceita origem válida do enum LeadOrigin (single → array)", () => {
    expect(parseDashboardFilters({ origin: "WHATSAPP" })).toEqual({
      origins: ["WHATSAPP"],
    });
    expect(parseDashboardFilters({ origin: "INSTAGRAM_DIRECT" })).toEqual({
      origins: ["INSTAGRAM_DIRECT"],
    });
  });

  it("aceita várias origens via CSV, descartando inválidas", () => {
    expect(
      parseDashboardFilters({ origin: "WHATSAPP,TIKTOK,INSTAGRAM_DIRECT" }),
    ).toEqual({ origins: ["WHATSAPP", "INSTAGRAM_DIRECT"] });
  });

  it("ignora origem inválida (silently)", () => {
    expect(parseDashboardFilters({ origin: "TIKTOK" })).toEqual({});
    expect(parseDashboardFilters({ origin: "" })).toEqual({});
    expect(parseDashboardFilters({ origin: "WHATSAPP_LOWERCASE" })).toEqual({});
  });

  it("trim e dedup em IDs e tags, ignora vazios/whitespace", () => {
    expect(
      parseDashboardFilters({
        modality: "  mod_gb1 , mod_gb1 ,mod_gb2 ",
        seller: " user_anna ",
        tag: "  Quente , Frio ",
      }),
    ).toEqual({
      modalityIds: ["mod_gb1", "mod_gb2"],
      sellerIds: ["user_anna"],
      tags: ["Quente", "Frio"],
    });

    expect(
      parseDashboardFilters({ modality: "  , ", seller: "", tag: "  " }),
    ).toEqual({});
  });

  it("combina vários filtros num resultado único", () => {
    expect(
      parseDashboardFilters({
        origin: "WHATSAPP",
        modality: "mod_x",
        seller: "user_y",
        tag: "Quente",
      }),
    ).toEqual({
      origins: ["WHATSAPP"],
      modalityIds: ["mod_x"],
      sellerIds: ["user_y"],
      tags: ["Quente"],
    });
  });
});

describe("activeFilterCount", () => {
  it("conta filtros presentes", () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ origins: ["WHATSAPP"] })).toBe(1);
    expect(
      activeFilterCount({
        origins: ["WHATSAPP"],
        modalityIds: ["x"],
        sellerIds: ["y"],
        tags: ["z"],
      }),
    ).toBe(4);
  });
});

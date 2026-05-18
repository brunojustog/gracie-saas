import { describe, expect, it } from "vitest";

import {
  activeFilterCount,
  parseDashboardFilters,
} from "../analytics-filters";

describe("parseDashboardFilters", () => {
  it("retorna vazio quando nada vem", () => {
    expect(parseDashboardFilters({})).toEqual({});
  });

  it("aceita origem válida do enum LeadOrigin", () => {
    expect(parseDashboardFilters({ origin: "WHATSAPP" })).toEqual({
      origin: "WHATSAPP",
    });
    expect(parseDashboardFilters({ origin: "INSTAGRAM_DIRECT" })).toEqual({
      origin: "INSTAGRAM_DIRECT",
    });
  });

  it("ignora origem inválida (silently)", () => {
    expect(parseDashboardFilters({ origin: "TIKTOK" })).toEqual({});
    expect(parseDashboardFilters({ origin: "" })).toEqual({});
    expect(parseDashboardFilters({ origin: "WHATSAPP_LOWERCASE" })).toEqual({});
  });

  it("trim em IDs e tag, ignora vazios/whitespace", () => {
    expect(
      parseDashboardFilters({
        modality: "  mod_gb1  ",
        seller: " user_anna ",
        tag: "  Quente  ",
      }),
    ).toEqual({
      modalityId: "mod_gb1",
      sellerId: "user_anna",
      tag: "Quente",
    });

    expect(
      parseDashboardFilters({ modality: "   ", seller: "", tag: "  " }),
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
      origin: "WHATSAPP",
      modalityId: "mod_x",
      sellerId: "user_y",
      tag: "Quente",
    });
  });
});

describe("activeFilterCount", () => {
  it("conta filtros presentes", () => {
    expect(activeFilterCount({})).toBe(0);
    expect(activeFilterCount({ origin: "WHATSAPP" })).toBe(1);
    expect(
      activeFilterCount({
        origin: "WHATSAPP",
        modalityId: "x",
        sellerId: "y",
        tag: "z",
      }),
    ).toBe(4);
  });
});

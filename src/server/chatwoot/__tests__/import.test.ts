import { describe, expect, it } from "vitest";

import type { ChatwootConversation } from "../api";
import { decideStage, pickInteractionDates } from "../import";

function conv(partial: Partial<ChatwootConversation>): ChatwootConversation {
  return { id: 1, status: "open", ...partial };
}

describe("decideStage", () => {
  it("sem conversa → Novo Lead + Sem conversa", () => {
    const hint = decideStage([], "Maria");
    expect(hint.stageName).toBe("Novo Lead");
    expect(hint.tags).toEqual(["Importado Chatwoot", "Sem conversa"]);
    expect(hint.notes).toContain("Maria");
  });

  it("open → Potencial", () => {
    const hint = decideStage([conv({ id: 99, status: "open" })], "x");
    expect(hint.stageName).toBe("Potencial");
    expect(hint.tags).toContain("Conversa aberta");
    expect(hint.notes).toContain("#99");
  });

  it("pending → Novo Lead", () => {
    const hint = decideStage([conv({ status: "pending" })], "x");
    expect(hint.stageName).toBe("Novo Lead");
    expect(hint.tags).toContain("Conversa pendente");
  });

  it("snoozed → Nutrição", () => {
    const hint = decideStage([conv({ status: "snoozed" })], "x");
    expect(hint.stageName).toBe("Nutrição");
    expect(hint.tags).toContain("Conversa snoozed");
  });

  it("resolved → Nutrição", () => {
    const hint = decideStage([conv({ status: "resolved" })], "x");
    expect(hint.stageName).toBe("Nutrição");
    expect(hint.tags).toContain("Conversa resolved");
  });

  it("status desconhecido → Novo Lead com label", () => {
    const hint = decideStage([conv({ status: "weird_state" })], "x");
    expect(hint.stageName).toBe("Novo Lead");
    expect(hint.tags.some((t) => t.includes("weird_state"))).toBe(true);
  });

  it("múltiplas conversas: usa a de last_activity_at mais alto", () => {
    const hint = decideStage(
      [
        conv({ id: 1, status: "resolved", last_activity_at: 1000 }),
        conv({ id: 2, status: "open", last_activity_at: 2000 }), // mais recente
        conv({ id: 3, status: "snoozed", last_activity_at: 1500 }),
      ],
      "x",
    );
    expect(hint.stageName).toBe("Potencial");
    expect(hint.notes).toContain("#2");
  });
});

describe("pickInteractionDates", () => {
  it("array vazio → first=last=now", () => {
    const now = Date.now();
    const { firstAt, lastAt } = pickInteractionDates([]);
    expect(firstAt).toBeInstanceOf(Date);
    expect(lastAt).toBeInstanceOf(Date);
    expect(Math.abs(firstAt.getTime() - now)).toBeLessThan(2000);
    expect(firstAt).toEqual(lastAt);
  });

  it("pega min e max das last_activity_at", () => {
    const { firstAt, lastAt } = pickInteractionDates([
      conv({ last_activity_at: 1_700_000_000 }),
      conv({ last_activity_at: 1_800_000_000 }),
      conv({ last_activity_at: 1_750_000_000 }),
    ]);
    expect(firstAt.getTime()).toBe(1_700_000_000 * 1000);
    expect(lastAt.getTime()).toBe(1_800_000_000 * 1000);
  });

  it("ignora epochs 0 ou ausentes", () => {
    const { firstAt, lastAt } = pickInteractionDates([
      conv({ last_activity_at: null }),
      conv({ last_activity_at: 0 }),
      conv({ last_activity_at: 1_700_000_000 }),
    ]);
    expect(firstAt.getTime()).toBe(1_700_000_000 * 1000);
    expect(lastAt.getTime()).toBe(1_700_000_000 * 1000);
  });
});

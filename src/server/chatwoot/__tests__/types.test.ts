import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  anyChatwootEventSchema,
  conversationCreatedSchema,
  contactCreatedSchema,
  handledEventSchema,
  messageCreatedSchema,
} from "../types";

const fixturesDir = join(__dirname, "fixtures");
const loadFixture = (name: string) =>
  JSON.parse(readFileSync(join(fixturesDir, name), "utf8"));

describe("conversationCreatedSchema", () => {
  it("aceita fixture real do Chatwoot", () => {
    const result = conversationCreatedSchema.safeParse(
      loadFixture("conversation-created.json"),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.event).toBe("conversation_created");
    expect(result.data.id).toBe(142);
    expect(result.data.meta?.sender?.name).toBe("Maria Silva");
    expect(result.data.meta?.sender?.phone_number).toBe("+5511987654321");
  });

  it("normaliza email vazio pra null (Chatwoot manda string vazia)", () => {
    const result = conversationCreatedSchema.safeParse({
      event: "conversation_created",
      id: 1,
      meta: { sender: { id: 1, email: "" } },
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.meta?.sender?.email).toBeNull();
  });
});

describe("contactCreatedSchema", () => {
  it("aceita fixture real do Chatwoot", () => {
    const result = contactCreatedSchema.safeParse(loadFixture("contact-created.json"));
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.event).toBe("contact_created");
    expect(result.data.name).toBe("João Pereira");
    expect(result.data.phone_number).toBe("+5511912345678");
  });
});

describe("messageCreatedSchema", () => {
  it("aceita fixture incoming (mensagem do contato)", () => {
    const result = messageCreatedSchema.safeParse(
      loadFixture("message-created-incoming.json"),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.message_type).toBe(0);
    expect(result.data.conversation?.id).toBe(142);
    expect(result.data.sender?.name).toBe("Maria Silva");
  });

  it("aceita fixture outgoing (mensagem do agente)", () => {
    const result = messageCreatedSchema.safeParse(
      loadFixture("message-created-outgoing.json"),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.message_type).toBe(1);
  });
});

describe("handledEventSchema (discriminated union)", () => {
  it("discrimina conversation_created", () => {
    const r = handledEventSchema.safeParse(loadFixture("conversation-created.json"));
    expect(r.success && r.data.event).toBe("conversation_created");
  });

  it("discrimina contact_created", () => {
    const r = handledEventSchema.safeParse(loadFixture("contact-created.json"));
    expect(r.success && r.data.event).toBe("contact_created");
  });

  it("discrimina message_created", () => {
    const r = handledEventSchema.safeParse(
      loadFixture("message-created-incoming.json"),
    );
    expect(r.success && r.data.event).toBe("message_created");
  });

  it("rejeita evento que não tratamos (cai em handledEventSchema = false)", () => {
    const result = handledEventSchema.safeParse({
      event: "conversation_status_changed",
      id: 1,
      status: "resolved",
    });
    expect(result.success).toBe(false);
  });

  it("evento desconhecido AINDA passa no genérico (pra logging)", () => {
    const result = anyChatwootEventSchema.safeParse({
      event: "webwidget_triggered",
      id: 1,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.event).toBe("webwidget_triggered");
  });
});

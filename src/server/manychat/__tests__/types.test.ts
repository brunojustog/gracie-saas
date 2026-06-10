import { describe, expect, it } from "vitest";

import {
  fallbackSubscriberName,
  normalizeIgUsername,
  stripManychatPlaceholders,
} from "../mapper";
import { handledEventSchema, manychatSubscriberSchema } from "../types";

describe("stripManychatPlaceholders", () => {
  it("placeholder puro vira null (campo vazio no flow)", () => {
    expect(stripManychatPlaceholders("{{phone}}")).toBeNull();
    expect(stripManychatPlaceholders("{{email}}")).toBeNull();
  });

  it("remove o token e preserva o resto", () => {
    expect(stripManychatPlaceholders("Val_Batista {{last_name}}")).toBe(
      "Val_Batista",
    );
    expect(stripManychatPlaceholders("{{first_name}} Souza")).toBe("Souza");
  });

  it("string vazia / só espaços vira null", () => {
    expect(stripManychatPlaceholders("")).toBeNull();
    expect(stripManychatPlaceholders("   ")).toBeNull();
  });

  it("string normal passa intacta", () => {
    expect(stripManychatPlaceholders("Maria Silva")).toBe("Maria Silva");
    expect(stripManychatPlaceholders("+55 11 99999-0000")).toBe(
      "+55 11 99999-0000",
    );
  });
});

describe("normalizeIgUsername", () => {
  it("remove @ inicial", () => {
    expect(normalizeIgUsername("@maria.bjj")).toBe("maria.bjj");
  });

  it("placeholder vira null", () => {
    expect(normalizeIgUsername("{{ig_username}}")).toBeNull();
  });

  it("username limpo passa intacto", () => {
    expect(normalizeIgUsername("val_batistaa.31")).toBe("val_batistaa.31");
  });
});

describe("manychatSubscriberSchema (sanitização no parse)", () => {
  // Payload REAL visto em prod: campos vazios chegam como placeholder literal.
  const realPayload = {
    id: "712508271",
    name: "Val_Batista {{last_name}}",
    email: "{{email}}",
    phone: "{{phone}}",
    channel: "instagram",
    ig_username: "val_batistaa.31",
  };

  it("limpa placeholders de phone/email e conserta o nome", () => {
    const result = manychatSubscriberSchema.safeParse(realPayload);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.phone).toBeNull();
    expect(result.data.email).toBeNull();
    expect(result.data.name).toBe("Val_Batista");
    expect(result.data.ig_username).toBe("val_batistaa.31");
  });

  it("subscriber só com placeholders ainda parseia (cai nos fallbacks)", () => {
    const result = manychatSubscriberSchema.safeParse({
      id: 123,
      name: "{{first_name}} {{last_name}}",
      phone: "{{phone}}",
      email: "{{email}}",
      ig_username: "{{ig_username}}",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.name).toBeNull();
    expect(result.data.ig_username).toBeNull();
    expect(fallbackSubscriberName(result.data)).toBe("Contato ManyChat");
  });
});

describe("handledEventSchema", () => {
  it("subscriber_created com payload sujo parseia e sanitiza", () => {
    const result = handledEventSchema.safeParse({
      event: "subscriber_created",
      subscriber: {
        id: "1353114411",
        name: "Lilian Miranda",
        email: "{{email}}",
        phone: "{{phone}}",
        channel: "instagram",
        ig_username: "lilianmirandamonteiro",
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.subscriber.phone).toBeNull();
    expect(result.data.subscriber.ig_username).toBe("lilianmirandamonteiro");
  });
});

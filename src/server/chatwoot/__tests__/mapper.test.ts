import { describe, expect, it } from "vitest";

import {
  CHANNEL_TO_ORIGIN,
  channelToOrigin,
  fallbackContactName,
  normalizeId,
} from "../mapper";

describe("channelToOrigin", () => {
  it("mapeia os canais principais corretamente", () => {
    expect(channelToOrigin("Channel::Whatsapp")).toBe("WHATSAPP");
    expect(channelToOrigin("Channel::Instagram")).toBe("INSTAGRAM_DIRECT");
    expect(channelToOrigin("Channel::FacebookPage")).toBe("FACEBOOK");
    expect(channelToOrigin("Channel::WebWidget")).toBe("WEBSITE");
  });

  it("canais SMS/Twilio caem em PHONE", () => {
    expect(channelToOrigin("Channel::Sms")).toBe("PHONE");
    expect(channelToOrigin("Channel::TwilioSms")).toBe("PHONE");
  });

  it("canais desconhecidos viram OTHER (fail-soft)", () => {
    expect(channelToOrigin("Channel::DiscordBot")).toBe("OTHER");
    expect(channelToOrigin("totally-bogus")).toBe("OTHER");
  });

  it("null/undefined/string vazia → OTHER", () => {
    expect(channelToOrigin(null)).toBe("OTHER");
    expect(channelToOrigin(undefined)).toBe("OTHER");
    expect(channelToOrigin("")).toBe("OTHER");
  });

  it("nenhum mapping vai pra um valor de LeadOrigin inválido (regressão)", () => {
    const validOrigins = new Set([
      "WHATSAPP",
      "INSTAGRAM_DIRECT",
      "FACEBOOK",
      "WEBSITE",
      "REFERRAL",
      "WALK_IN",
      "PHONE",
      "GOOGLE_ADS",
      "OTHER",
    ]);
    for (const origin of Object.values(CHANNEL_TO_ORIGIN)) {
      expect(validOrigins.has(origin)).toBe(true);
    }
  });
});

describe("normalizeId", () => {
  it.each([
    [42, "42"],
    ["42", "42"],
    [0, "0"],
    ["", ""],
  ])("%s → %s", (input, expected) => {
    expect(normalizeId(input)).toBe(expected);
  });

  it("null/undefined → null", () => {
    expect(normalizeId(null)).toBeNull();
    expect(normalizeId(undefined)).toBeNull();
  });
});

describe("fallbackContactName", () => {
  it("usa name quando presente", () => {
    expect(fallbackContactName({ name: "Maria" })).toBe("Maria");
  });

  it("trim em campos com espaço", () => {
    expect(fallbackContactName({ name: "  Maria  " })).toBe("Maria");
  });

  it("cai pra phone se name vazio", () => {
    expect(fallbackContactName({ name: "", phone_number: "+5511..." })).toBe("+5511...");
    expect(fallbackContactName({ name: null, phone_number: "+5511..." })).toBe("+5511...");
  });

  it("ordem de fallback: name → phone → email → identifier → constante", () => {
    expect(
      fallbackContactName({ email: "user@example.com", identifier: "ext-1" }),
    ).toBe("user@example.com");
    expect(fallbackContactName({ identifier: "ext-1" })).toBe("ext-1");
    expect(fallbackContactName({})).toBe("Contato sem nome");
  });
});

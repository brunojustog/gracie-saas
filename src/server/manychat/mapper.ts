/**
 * Mappers puros entre dados do ManyChat e enums do nosso domínio.
 * Sem Prisma — testável em isolamento.
 */
import type { LeadOrigin } from "@prisma/client";

/**
 * Channels do ManyChat → LeadOrigin. Keys já normalizadas em lowercase
 * pelo schema (manychatChannelSchema). Default: MANYCHAT (que existe no
 * enum desde v1.1).
 */
export const CHANNEL_TO_ORIGIN: Record<string, LeadOrigin> = {
  whatsapp: "WHATSAPP",
  instagram: "INSTAGRAM_DIRECT",
  facebook: "FACEBOOK",
  messenger: "FACEBOOK",
  sms: "PHONE",
  telegram: "OTHER",
  email: "OTHER",
};

export function channelToOrigin(
  channel: string | null | undefined,
): LeadOrigin {
  if (!channel) return "MANYCHAT";
  return CHANNEL_TO_ORIGIN[channel] ?? "MANYCHAT";
}

/** Normaliza ID do ManyChat — pode vir como number ou string. Persistimos como string. */
export function normalizeId(
  id: number | string | null | undefined,
): string | null {
  if (id === null || id === undefined) return null;
  return String(id);
}

/**
 * Constrói nome fallback. ManyChat às vezes manda só first_name, ou só
 * ig_username (Instagram quando o user não compartilhou o nome real),
 * ou só phone (WhatsApp inicial).
 */
export function fallbackSubscriberName(subscriber: {
  name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  phone?: string | null;
  email?: string | null;
  ig_username?: string | null;
}): string {
  const fullFromParts = [subscriber.first_name, subscriber.last_name]
    .map((s) => s?.trim())
    .filter(Boolean)
    .join(" ");

  return (
    subscriber.name?.trim() ||
    fullFromParts ||
    subscriber.ig_username?.trim() ||
    subscriber.phone?.trim() ||
    subscriber.email?.trim() ||
    "Contato ManyChat"
  );
}

/**
 * Mappers puros entre dados do Chatwoot e enums do nosso domínio.
 * Sem Prisma — testável em isolamento.
 */
import type { LeadOrigin } from "@prisma/client";

/**
 * Os channel types reais que o Chatwoot emite. Documentação oficial em
 * https://www.chatwoot.com/developers/api/ menciona estes valores.
 */
export const CHANNEL_TO_ORIGIN: Record<string, LeadOrigin> = {
  "Channel::Whatsapp": "WHATSAPP",
  "Channel::Instagram": "INSTAGRAM_DIRECT",
  "Channel::FacebookPage": "FACEBOOK",
  "Channel::WebWidget": "WEBSITE",
  "Channel::Sms": "PHONE",
  "Channel::Email": "OTHER",
  "Channel::Api": "OTHER",
  "Channel::Telegram": "OTHER",
  "Channel::Line": "OTHER",
  "Channel::Twitter": "OTHER",
  "Channel::TwilioSms": "PHONE",
};

export function channelToOrigin(channel: string | null | undefined): LeadOrigin {
  if (!channel) return "OTHER";
  return CHANNEL_TO_ORIGIN[channel] ?? "OTHER";
}

/**
 * Normaliza ID do Chatwoot — pode vir como number ou string dependendo do
 * evento e versão. Persistimos sempre como string em `chatwootContactId` /
 * `chatwootConversationId`.
 */
export function normalizeId(id: number | string | null | undefined): string | null {
  if (id === null || id === undefined) return null;
  return String(id);
}

/**
 * Constrói nome de fallback quando o contato chega sem `name` no Chatwoot
 * (acontece em WhatsApp inicial, antes de o lead enviar nome).
 */
export function fallbackContactName(contact: {
  name?: string | null;
  phone_number?: string | null;
  email?: string | null;
  identifier?: string | null;
}): string {
  return (
    contact.name?.trim() ||
    contact.phone_number?.trim() ||
    contact.email?.trim() ||
    contact.identifier?.trim() ||
    "Contato sem nome"
  );
}

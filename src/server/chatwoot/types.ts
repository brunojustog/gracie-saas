/**
 * Zod schemas para webhook payloads do Chatwoot.
 *
 * Os payloads do Chatwoot variam BASTANTE entre versões e canais. Política:
 *   - validar só o mínimo essencial (event + ids do que vamos usar)
 *   - usar `.passthrough()` ou `z.unknown()` no resto pra não quebrar
 *     quando o Chatwoot adicionar campos
 *   - o payload completo SEMPRE é gravado em WebhookLog antes do parse,
 *     então mesmo se o parse falhar, temos auditoria
 *
 * Referência: https://www.chatwoot.com/docs/product/channels/api/webhooks
 */
import { z } from "zod";

// ──────────────────────────────────────────────────────────────────────────
// Sub-schemas reutilizáveis
// ──────────────────────────────────────────────────────────────────────────

/** Os channel types que o Chatwoot emite no campo `channel` ou `inbox.channel_type`. */
export const chatwootChannelSchema = z.string();

export const chatwootContactSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    name: z.string().nullish(),
    email: z.string().email().nullish().or(z.literal("").transform(() => null)),
    phone_number: z.string().nullish(),
    identifier: z.string().nullish(),
  })
  .passthrough();

export const chatwootInboxRefSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    channel_type: chatwootChannelSchema.nullish(),
    name: z.string().nullish(),
  })
  .passthrough();

// ──────────────────────────────────────────────────────────────────────────
// Eventos
// ──────────────────────────────────────────────────────────────────────────

export const conversationCreatedSchema = z
  .object({
    event: z.literal("conversation_created"),
    id: z.union([z.number(), z.string()]),
    inbox_id: z.union([z.number(), z.string()]).nullish(),
    channel: chatwootChannelSchema.nullish(),
    status: z.string().nullish(),
    /**
     * Labels da conversa (v1.1-U). O Chatwoot manda como array de strings
     * (nomes das labels). Pode vir vazio/ausente quando a conversa nasce
     * sem label ainda.
     */
    labels: z.array(z.string()).nullish(),
    meta: z
      .object({
        sender: chatwootContactSchema.optional(),
        channel: chatwootChannelSchema.nullish(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const contactCreatedSchema = z
  .object({
    event: z.literal("contact_created"),
    id: z.union([z.number(), z.string()]),
    name: z.string().nullish(),
    email: z.string().nullish(),
    phone_number: z.string().nullish(),
    identifier: z.string().nullish(),
  })
  .passthrough();

export const messageCreatedSchema = z
  .object({
    event: z.literal("message_created"),
    id: z.union([z.number(), z.string()]),
    /** 0 = incoming (do contato pra agente), 1 = outgoing (agente pra contato). */
    message_type: z.union([z.number(), z.string()]).nullish(),
    content: z.string().nullish(),
    conversation: z
      .object({
        id: z.union([z.number(), z.string()]),
        inbox_id: z.union([z.number(), z.string()]).nullish(),
        channel: chatwootChannelSchema.nullish(),
        labels: z.array(z.string()).nullish(),
        meta: z
          .object({
            sender: chatwootContactSchema.optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    sender: chatwootContactSchema.optional(),
  })
  .passthrough();

/**
 * Discriminated union dos eventos que tratamos. Outros eventos (`conversation_status_changed`,
 * `webwidget_triggered`, etc) caem no schema genérico abaixo — viramos no-op no handler,
 * mas ainda assim logamos.
 */
export const handledEventSchema = z.discriminatedUnion("event", [
  conversationCreatedSchema,
  contactCreatedSchema,
  messageCreatedSchema,
]);

export const anyChatwootEventSchema = z
  .object({ event: z.string() })
  .passthrough();

export type HandledChatwootEvent = z.infer<typeof handledEventSchema>;
export type AnyChatwootEvent = z.infer<typeof anyChatwootEventSchema>;

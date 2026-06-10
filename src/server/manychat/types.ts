/**
 * Zod schemas pra webhook payloads do ManyChat.
 *
 * ManyChat NÃO tem um payload canônico — o admin monta o JSON dentro de
 * cada "External Request" do flow. A gente define um contrato esperado e
 * documenta na tela de Settings; o admin precisa usar variáveis do
 * ManyChat ({{user_id}}, {{first_name}}, etc.) pra preencher.
 *
 * Política (igual Chatwoot):
 *   - valida só o essencial (event + subscriber.id)
 *   - `.passthrough()` no resto pra aceitar campos extras sem quebrar
 *   - payload completo é gravado em WebhookLog antes do parse — mesmo se
 *     parse falhar, temos auditoria
 *
 * Eventos suportados na v1.1-AA (webhook-in only):
 *   - subscriber_created   → cria Lead
 *   - tag_applied          → adiciona tag ao Lead
 *   - flow_response        → atualiza Lead com respostas do flow
 *   - conversation_started → marca lastInteractionAt
 *   - conversation_ended   → marca lastInteractionAt
 */
import { z } from "zod";

import { normalizeIgUsername, stripManychatPlaceholders } from "./mapper";

// ──────────────────────────────────────────────────────────────────────────
// Sub-schemas
// ──────────────────────────────────────────────────────────────────────────

/**
 * Canais que o ManyChat opera. Mapeados pra LeadOrigin no mapper.
 * Case-insensitive — admin pode mandar "whatsapp", "WhatsApp", "WHATSAPP".
 */
export const manychatChannelSchema = z
  .string()
  .transform((s) => s.toLowerCase())
  .nullish();

/**
 * String "suja" do ManyChat: quando a variável do flow está vazia, chega o
 * placeholder literal ("{{phone}}"). Sanitiza no parse — campos que ficam
 * vazios viram null (e os handlers tratam null como "não veio").
 */
const manychatStringSchema = z
  .string()
  .transform(stripManychatPlaceholders)
  .nullish();

export const manychatSubscriberSchema = z
  .object({
    id: z.union([z.number(), z.string()]),
    name: manychatStringSchema,
    first_name: manychatStringSchema,
    last_name: manychatStringSchema,
    phone: manychatStringSchema,
    email: manychatStringSchema,
    ig_username: z.string().transform(normalizeIgUsername).nullish(),
    channel: manychatChannelSchema,
  })
  .passthrough();

// ──────────────────────────────────────────────────────────────────────────
// Eventos discriminados por `event`
// ──────────────────────────────────────────────────────────────────────────

export const subscriberCreatedSchema = z
  .object({
    event: z.literal("subscriber_created"),
    subscriber: manychatSubscriberSchema,
    timestamp: z.string().datetime().nullish(),
  })
  .passthrough();

export const tagAppliedSchema = z
  .object({
    event: z.literal("tag_applied"),
    subscriber: manychatSubscriberSchema,
    tag: z.string().min(1),
    timestamp: z.string().datetime().nullish(),
  })
  .passthrough();

export const flowResponseSchema = z
  .object({
    event: z.literal("flow_response"),
    subscriber: manychatSubscriberSchema,
    /**
     * Custom fields que o flow do ManyChat coletou. Estrutura livre: key
     * é o nome do field (ex: "modalidade", "idade"), value é o que o lead
     * respondeu. Persistido em LeadNote como metadata pra histórico.
     */
    fields: z.record(z.string(), z.unknown()).nullish(),
    timestamp: z.string().datetime().nullish(),
  })
  .passthrough();

export const conversationStartedSchema = z
  .object({
    event: z.literal("conversation_started"),
    subscriber: manychatSubscriberSchema,
    timestamp: z.string().datetime().nullish(),
  })
  .passthrough();

export const conversationEndedSchema = z
  .object({
    event: z.literal("conversation_ended"),
    subscriber: manychatSubscriberSchema,
    timestamp: z.string().datetime().nullish(),
  })
  .passthrough();

/**
 * Discriminated union de TODOS os eventos que tratamos. Eventos com `event`
 * desconhecido caem fora desse parse e são apenas logados (não dispatch).
 */
export const handledEventSchema = z.discriminatedUnion("event", [
  subscriberCreatedSchema,
  tagAppliedSchema,
  flowResponseSchema,
  conversationStartedSchema,
  conversationEndedSchema,
]);

export type HandledManychatEvent = z.infer<typeof handledEventSchema>;

/**
 * Schema permissivo só pra extrair o `event` quando o payload não bater
 * com nenhum handler — usado pra estatística no WebhookLog.
 */
export const anyManychatEventSchema = z
  .object({ event: z.string() })
  .passthrough();

/**
 * Zod schemas pro webhook do plugin de Kanban do Chatwoot (v1.1-V).
 *
 * Formato diferente do webhook nativo:
 *   - Evento "kanban.item.created" (e outros que não tratamos por ora:
 *     item_updated, item_deleted, stage_changed, items_reordered)
 *   - Payload aninhado em data.item
 *   - NÃO traz dados do contato — só conversation_id + account_id
 *
 * Por causa disso, o handler busca a conversa via API REST do Chatwoot pra
 * extrair `meta.sender` antes de criar o lead.
 *
 * Igual ao schema nativo: `.passthrough()` em tudo pra não quebrar quando
 * o plugin adicionar campos. O WebhookLog grava o payload bruto.
 */
import { z } from "zod";

export const kanbanItemCreatedSchema = z
  .object({
    event: z.literal("kanban.item.created"),
    data: z
      .object({
        item: z
          .object({
            id: z.number(),
            account_id: z.number(),
            /**
             * ID público da conversa (o que aparece na URL do Chatwoot).
             * É o que devemos usar pra buscar via API e pro link no card.
             */
            conversation_display_id: z.number().nullish(),
            funnel_id: z.number().nullish(),
            funnel_stage: z.string().nullish(),
            item_details: z
              .object({
                title: z.string().nullish(),
                /** Fallback: alguns payloads colocam o display_id aqui também. */
                conversation_id: z.number().nullish(),
              })
              .passthrough()
              .optional(),
          })
          .passthrough(),
        account_id: z.number(),
        timestamp: z.string().nullish(),
      })
      .passthrough(),
  })
  .passthrough();

export type KanbanItemCreatedEvent = z.infer<typeof kanbanItemCreatedSchema>;

/**
 * Eventos do plugin de kanban que conhecemos (mas só tratamos `item.created`
 * por enquanto). Os outros viram log + no-op.
 */
export const anyKanbanEventSchema = z
  .object({ event: z.string() })
  .passthrough();

/**
 * Webhook genérico de leads do site (v1.1-AB).
 *
 * Pensado pro formulário de contato do site do tenant (ou Elementor/
 * Gravity Forms/Zapier/n8n — qualquer coisa que faça POST de JSON).
 *
 * Dedup: telefone (últimos 8+ dígitos) ou e-mail já existente no tenant →
 * atualiza o lead e registra a nova mensagem no diário em vez de duplicar.
 */
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { appendLeadNote } from "@/server/lead-notes";

/** Campos vazios ("") viram null; espaços são aparados. */
const optionalTrimmed = z
  .string()
  .max(500)
  .transform((s) => {
    const t = s.trim();
    return t === "" ? null : t;
  })
  .nullish();

export const siteLeadPayloadSchema = z
  .object({
    name: z.string().min(1).max(200).transform((s) => s.trim()),
    phone: optionalTrimmed,
    email: optionalTrimmed,
    /** Mensagem livre do formulário — vai pro diário do lead. */
    message: z.string().max(5000).nullish(),
    /** Identificação da página/formulário de origem (ex: "lp-kids", "home"). */
    source: optionalTrimmed,
    /**
     * v1.1-AJ: nome da modalidade de interesse (select do formulário).
     * Casado case-insensitive contra as modalidades ATIVAS do tenant →
     * vira Lead.modalityId (badge no card do kanban). Nome desconhecido
     * não quebra: fica só registrado no diário.
     */
    modality: optionalTrimmed,
    /** v1.1-AJ: cidade/bairro do formulário — vai pro diário do lead. */
    address: optionalTrimmed,
  })
  .passthrough();

export type SiteLeadPayload = z.infer<typeof siteLeadPayloadSchema>;

export type SiteLeadResult =
  | { kind: "created"; leadId: string }
  | { kind: "updated"; leadId: string }
  | { kind: "skipped"; reason: string };

/** Só dígitos; descarta lixo curto (mínimo 8 = fixo sem DDD). */
function normalizePhoneDigits(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 8 ? digits : null;
}

export async function upsertLeadFromSite(
  tenantId: string,
  payload: SiteLeadPayload,
): Promise<SiteLeadResult> {
  const name = payload.name;
  if (!name) return { kind: "skipped", reason: "nome vazio" };

  const phoneDigits = normalizePhoneDigits(payload.phone);
  const email = payload.email?.toLowerCase() ?? null;
  const now = new Date();

  // Dedup por e-mail exato ou sufixo do telefone. Telefone é comparado por
  // DÍGITOS (regexp_replace no banco) porque o formato armazenado varia —
  // "(11) 98888-7777" vs "11988887777" vs "+5511988887777". 8 últimos
  // dígitos = número local completo, com ou sem DDD/+55.
  let existing: {
    id: string;
    email: string | null;
    phone: string | null;
    modalityId: string | null;
  } | null = null;

  if (email) {
    existing = await prisma.lead.findFirst({
      where: {
        tenantId,
        deletedAt: null,
        email: { equals: email, mode: "insensitive" },
      },
      select: { id: true, email: true, phone: true, modalityId: true },
    });
  }
  if (!existing && phoneDigits) {
    const suffix = phoneDigits.slice(-8);
    const matches = await prisma.$queryRaw<
      Array<{
        id: string;
        email: string | null;
        phone: string | null;
        modalityId: string | null;
      }>
    >`
      SELECT id, email, phone, "modalityId" FROM "Lead"
      WHERE "tenantId" = ${tenantId}
        AND "deletedAt" IS NULL
        AND regexp_replace(COALESCE(phone, ''), '\\D', '', 'g') LIKE ${"%" + suffix}
      ORDER BY "lastInteractionAt" DESC
      LIMIT 1
    `;
    existing = matches[0] ?? null;
  }

  // Resolve a modalidade pelo nome (case-insensitive, só ativas do tenant).
  const modality = payload.modality
    ? await prisma.modality.findFirst({
        where: {
          tenantId,
          active: true,
          name: { equals: payload.modality, mode: "insensitive" },
        },
        select: { id: true, name: true },
      })
    : null;

  const noteLines = [
    `Novo contato pelo site${payload.source ? ` (${payload.source})` : ""}`,
  ];
  if (payload.modality) {
    noteLines.push(
      `• Modalidade de interesse: ${payload.modality}${modality ? "" : " (não encontrada no catálogo — definir no card)"}`,
    );
  }
  if (payload.address) noteLines.push(`• Endereço: ${payload.address}`);
  if (payload.message?.trim()) noteLines.push(`• Mensagem: ${payload.message.trim()}`);
  const messageNote = noteLines.join("\n");
  const hasNoteDetails = noteLines.length > 1;

  if (existing) {
    await prisma.$transaction(async (tx) => {
      await tx.lead.update({
        where: { id: existing.id },
        data: {
          lastInteractionAt: now,
          // Completa contatos que o lead não tinha — nunca sobrescreve.
          ...(email && !existing.email ? { email } : {}),
          ...(payload.phone && !existing.phone ? { phone: payload.phone } : {}),
          ...(modality && !existing.modalityId
            ? { modalityId: modality.id }
            : {}),
        },
      });
      await appendLeadNote(
        {
          tenantId,
          leadId: existing.id,
          kind: "MANUAL",
          body: messageNote,
          metadata: { event: "site_form", source: payload.source ?? null },
        },
        tx,
      );
    });
    return { kind: "updated", leadId: existing.id };
  }

  const initialStage = await prisma.stage.findFirst({
    where: { tenantId, active: true },
    orderBy: { order: "asc" },
    select: { id: true },
  });
  if (!initialStage) {
    return { kind: "skipped", reason: "tenant sem stage ativo configurado" };
  }

  const created = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.create({
      data: {
        tenantId,
        stageId: initialStage.id,
        name,
        phone: payload.phone ?? null,
        email,
        origin: "WEBSITE",
        originDetail: payload.source ?? null,
        modalityId: modality?.id ?? null,
        firstInteractionAt: now,
        lastInteractionAt: now,
      },
    });
    await tx.stageHistory.create({
      data: {
        leadId: lead.id,
        toStageId: initialStage.id,
        notes: "Lead criado via formulário do site",
      },
    });
    if (hasNoteDetails) {
      await appendLeadNote(
        {
          tenantId,
          leadId: lead.id,
          kind: "MANUAL",
          body: messageNote,
          metadata: { event: "site_form", source: payload.source ?? null },
        },
        tx,
      );
    }
    return lead;
  });

  return { kind: "created", leadId: created.id };
}

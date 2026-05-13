/**
 * Camada de criação e leitura do diário do lead (LeadNote).
 *
 * Eventos automáticos chamam `appendLeadNote` direto (sem server action) das
 * próprias server actions de domínio — ex: cancelEnrollment chama com kind
 * ENROLLMENT_CANCELED. O parâmetro `tx` opcional permite executar dentro de
 * uma transação Prisma já em andamento (importante: o note só existe se o
 * evento de domínio concluiu).
 *
 * Já a observação manual entra via server action `addLeadNote` na camada
 * de actions, que valida scope (lead pertence ao tenant + role).
 */
import type { LeadNoteKind, Prisma, PrismaClient, TenantUser } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { scopedLeadWhere } from "@/server/leads";

export type AppendLeadNoteInput = {
  tenantId: string;
  leadId: string;
  authorId?: string | null;
  kind: LeadNoteKind;
  body: string;
  metadata?: Prisma.InputJsonValue | null;
};

type TxClient = Pick<PrismaClient, "leadNote">;

/**
 * Insere uma entrada no diário. Aceita um cliente de transação opcional
 * (`tx`) — quando o evento de domínio está dentro de prisma.$transaction,
 * passe o `tx` pra garantir atomicidade (rollback se o note falhar e
 * vice-versa).
 *
 * Erros são logados mas não propagados pra não derrubar o evento principal
 * — uma entrada faltando no diário é menos grave que perder a mudança de
 * domínio (matrícula congelada, follow-up pausado, etc).
 */
export async function appendLeadNote(
  input: AppendLeadNoteInput,
  tx?: TxClient,
): Promise<void> {
  const client = tx ?? prisma;
  try {
    await client.leadNote.create({
      data: {
        tenantId: input.tenantId,
        leadId: input.leadId,
        authorId: input.authorId ?? null,
        kind: input.kind,
        body: input.body,
        metadata: input.metadata ?? undefined,
      },
    });
  } catch (err) {
    console.error("[lead-notes] appendLeadNote falhou", {
      leadId: input.leadId,
      kind: input.kind,
      err,
    });
  }
}

export type LeadNoteFilter = "all" | "manual";

export type LeadNoteRow = {
  id: string;
  kind: LeadNoteKind;
  body: string;
  createdAt: Date;
  author: { id: string; name: string | null; email: string } | null;
};

/**
 * Lista entradas do diário de UM lead, mais recentes primeiro. Aplica
 * scope de leitura (SELLER só vê seus próprios leads — herda do mesmo
 * filtro do kanban).
 */
export async function listLeadNotes(
  membership: TenantUser,
  leadId: string,
  filter: LeadNoteFilter = "all",
): Promise<LeadNoteRow[] | null> {
  // Garante que o lead pertence ao escopo antes de listar — proteção contra
  // ID forjado.
  const lead = await prisma.lead.findFirst({
    where: { id: leadId, ...scopedLeadWhere(membership) },
    select: { id: true },
  });
  if (!lead) return null;

  const notes = await prisma.leadNote.findMany({
    where: {
      leadId,
      ...(filter === "manual" ? { kind: "MANUAL" } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      kind: true,
      body: true,
      createdAt: true,
      author: { select: { id: true, name: true, email: true } },
    },
  });

  return notes;
}

"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { findEnrollmentInScope } from "@/server/enrollments";
import { appendLeadNote } from "@/server/lead-notes";
import { requireTenantUser } from "@/server/tenant";

/**
 * Cobrança de inadimplentes (v1.1-AL). Cada ação de cobrança vira uma
 * LeadNote kind COLLECTION_NOTE no diário do aluno — assim o histórico fica
 * junto da ficha e qualquer role do tenant (quem cobra) pode registrar.
 */

export type CollectionNote = {
  id: string;
  body: string;
  createdAt: Date;
  author: string | null;
};

const addSchema = z.object({
  enrollmentId: z.string().min(1),
  body: z.string().min(1).max(2000),
});

export async function addCollectionNote(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };

  const { tenant, user, membership } = await requireTenantUser();
  const enrollment = await findEnrollmentInScope(membership, parsed.data.enrollmentId);
  if (!enrollment) return { ok: false, error: "matrícula não encontrada ou sem permissão" };

  await appendLeadNote({
    tenantId: tenant.id,
    leadId: enrollment.leadId,
    authorId: user.id,
    kind: "COLLECTION_NOTE",
    body: parsed.data.body.trim(),
    metadata: { enrollmentId: enrollment.id },
  });

  revalidatePath("/dashboard");
  return { ok: true };
}

/** Histórico de cobrança de uma matrícula (mais recente primeiro). */
export async function getCollectionNotes(
  enrollmentId: string,
): Promise<CollectionNote[]> {
  const { membership } = await requireTenantUser();
  const enrollment = await findEnrollmentInScope(membership, enrollmentId);
  if (!enrollment) return [];

  const notes = await prisma.leadNote.findMany({
    where: { leadId: enrollment.leadId, kind: "COLLECTION_NOTE" },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      body: true,
      createdAt: true,
      author: { select: { name: true, email: true } },
    },
  });

  return notes.map((n) => ({
    id: n.id,
    body: n.body,
    createdAt: n.createdAt,
    author: n.author?.name ?? n.author?.email ?? null,
  }));
}

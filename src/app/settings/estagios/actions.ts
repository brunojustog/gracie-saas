"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireRole } from "@/server/tenant";

type Result = { ok: true } | { ok: false; error: string };

const stageSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
  isScheduling: z.boolean().default(false),
  active: z.boolean().default(true),
});

export async function upsertStage(input: unknown): Promise<Result> {
  const parsed = stageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  if (parsed.data.isWon && parsed.data.isLost) {
    return { ok: false, error: "stage não pode ser won e lost ao mesmo tempo" };
  }
  const { tenant } = await requireRole("ADMIN");

  if (parsed.data.id) {
    const target = await prisma.stage.findFirst({
      where: { id: parsed.data.id, tenantId: tenant.id },
    });
    if (!target) return { ok: false, error: "estágio não encontrado" };
    await prisma.stage.update({
      where: { id: target.id },
      data: {
        name: parsed.data.name,
        color: parsed.data.color,
        isWon: parsed.data.isWon,
        isLost: parsed.data.isLost,
        isScheduling: parsed.data.isScheduling,
        active: parsed.data.active,
      },
    });
  } else {
    // Append no fim — order = max + 1
    const max = await prisma.stage.aggregate({
      where: { tenantId: tenant.id },
      _max: { order: true },
    });
    await prisma.stage.create({
      data: {
        tenantId: tenant.id,
        name: parsed.data.name,
        color: parsed.data.color,
        isWon: parsed.data.isWon,
        isLost: parsed.data.isLost,
        isScheduling: parsed.data.isScheduling,
        order: (max._max.order ?? 0) + 1,
      },
    });
  }
  revalidatePath("/settings/estagios");
  revalidatePath("/kanban");
  return { ok: true };
}

const reorderSchema = z.object({
  ids: z.array(z.string()).min(1),
});

/**
 * Reordena os estágios pra refletir a nova ordem visual.
 *
 * O schema tem unique(tenantId, order). Pra atualizar `order` de várias
 * rows sem violar a constraint na metade, fazemos em 2 passos numa
 * transação: (1) zera todas com offset negativo, (2) seta valor final.
 */
export async function reorderStages(input: unknown): Promise<Result> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "input inválido" };
  const { tenant } = await requireRole("ADMIN");

  // Garante que todos os ids são do tenant
  const stages = await prisma.stage.findMany({
    where: { tenantId: tenant.id, id: { in: parsed.data.ids } },
    select: { id: true },
  });
  if (stages.length !== parsed.data.ids.length) {
    return { ok: false, error: "ids inválidos" };
  }

  await prisma.$transaction(async (tx) => {
    // Pass 1: offset negativo pra evitar colisão com unique
    for (let i = 0; i < parsed.data.ids.length; i++) {
      await tx.stage.update({
        where: { id: parsed.data.ids[i]! },
        data: { order: -(i + 1) },
      });
    }
    // Pass 2: valor final
    for (let i = 0; i < parsed.data.ids.length; i++) {
      await tx.stage.update({
        where: { id: parsed.data.ids[i]! },
        data: { order: i + 1 },
      });
    }
  });

  revalidatePath("/settings/estagios");
  revalidatePath("/kanban");
  return { ok: true };
}

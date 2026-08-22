/**
 * v1.2-U: foto de um evento da linha do tempo. Autorização: staff vê qualquer
 * uma do tenant; o aluno vê as dele. `id` = TimelineEventPhoto.id.
 */
import { prisma } from "@/lib/prisma";
import { auth } from "@/server/auth";
import { getCurrentTenant } from "@/server/tenant";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return new Response("Não autenticado", { status: 401 });

  const tenant = await getCurrentTenant();
  if (!tenant) return new Response("Tenant inválido", { status: 404 });

  const photo = await prisma.timelineEventPhoto.findFirst({
    where: { id, event: { tenantId: tenant.id } },
    select: {
      data: true,
      mime: true,
      event: { select: { aluno: { select: { userId: true } } } },
    },
  });
  if (!photo) return new Response("Sem foto", { status: 404 });

  const membership = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
    select: { role: true, active: true },
  });
  const isStaff = !!membership?.active && membership.role !== "ALUNO";
  const isOwner = photo.event.aluno.userId === session.user.id;
  if (!isStaff && !isOwner) return new Response("Sem permissão", { status: 403 });

  const bytes = new Uint8Array(photo.data);
  return new Response(bytes, {
    headers: {
      "Content-Type": photo.mime,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=300",
    },
  });
}

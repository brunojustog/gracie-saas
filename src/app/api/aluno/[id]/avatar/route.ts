/**
 * v1.2-I: foto de perfil (avatar) do aluno. Autorização: staff (admin/gerente/
 * vendedora/professor) vê qualquer uma do tenant; o aluno vê a própria. Bytes
 * no Postgres. `id` = alunoId.
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

  const aluno = await prisma.aluno.findFirst({
    where: { id, tenantId: tenant.id },
    select: { photoData: true, photoMime: true, userId: true },
  });
  if (!aluno?.photoData || !aluno.photoMime) {
    return new Response("Sem foto", { status: 404 });
  }

  const membership = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
    select: { role: true, active: true },
  });
  const isStaff = !!membership?.active && membership.role !== "ALUNO";
  const isOwner = aluno.userId === session.user.id;
  if (!isStaff && !isOwner) return new Response("Sem permissão", { status: 403 });

  const bytes = new Uint8Array(aluno.photoData);
  return new Response(bytes, {
    headers: {
      "Content-Type": aluno.photoMime,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=60",
    },
  });
}

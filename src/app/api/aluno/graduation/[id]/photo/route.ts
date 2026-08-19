/**
 * v1.2-C: foto da graduação. Autorização: staff (admin/gerente/vendedora/
 * professor) vê qualquer uma do tenant; o aluno vê só as dele. Bytes no Postgres.
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

  const grad = await prisma.graduation.findFirst({
    where: { id, tenantId: tenant.id },
    select: { photoData: true, photoMime: true, alunoId: true },
  });
  if (!grad?.photoData || !grad.photoMime) {
    return new Response("Sem foto", { status: 404 });
  }

  const membership = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
    select: { role: true, active: true },
  });
  const isStaff = !!membership?.active && membership.role !== "ALUNO";

  let isOwner = false;
  if (!isStaff && membership?.active) {
    const myAluno = await prisma.aluno.findFirst({
      where: { tenantId: tenant.id, userId: session.user.id },
      select: { id: true },
    });
    isOwner = myAluno?.id === grad.alunoId;
  }
  if (!isStaff && !isOwner) return new Response("Sem permissão", { status: 403 });

  const bytes = new Uint8Array(grad.photoData);
  return new Response(bytes, {
    headers: {
      "Content-Type": grad.photoMime,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, no-store",
    },
  });
}

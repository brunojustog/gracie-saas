/**
 * v1.2-AS: foto do professor (bytes no Postgres), exibida no card da aula.
 * Qualquer usuário do tenant (inclusive o aluno) pode ver. `id` = professorId.
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

  const membership = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
    select: { active: true },
  });
  if (!membership?.active) return new Response("Sem permissão", { status: 403 });

  const prof = await prisma.professor.findFirst({
    where: { id, tenantId: tenant.id },
    select: { photoData: true, photoMime: true },
  });
  if (!prof?.photoData || !prof.photoMime) {
    return new Response("Sem foto", { status: 404 });
  }

  const bytes = new Uint8Array(prof.photoData);
  return new Response(bytes, {
    headers: {
      "Content-Type": prof.photoMime,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=60",
    },
  });
}

/**
 * v1.1-CJ: download da nota fiscal (PDF) do professor.
 *
 * Autorização: ADMIN baixa qualquer NF do tenant; PROFESSOR só as dele.
 * Os bytes vêm do Postgres (não há storage de arquivos na infra).
 */
import { prisma } from "@/lib/prisma";
import { roleAtLeast } from "@/server/rbac";
import { requireProfessor } from "@/server/tenant";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  // requireProfessor permite ADMIN + PROFESSOR (e redireciona os demais).
  const { tenant, membership, professor } = await requireProfessor();

  const inv = await prisma.professorInvoice.findFirst({
    where: { id, tenantId: tenant.id },
    select: { data: true, mimeType: true, fileName: true, professorId: true },
  });
  if (!inv) return new Response("Nota fiscal não encontrada", { status: 404 });

  const isAdmin = roleAtLeast(membership.role, "ADMIN");
  const isOwner = professor?.id === inv.professorId;
  if (!isAdmin && !isOwner) {
    return new Response("Sem permissão", { status: 403 });
  }

  const bytes = new Uint8Array(inv.data);
  const encodedName = encodeURIComponent(inv.fileName);
  return new Response(bytes, {
    headers: {
      "Content-Type": inv.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="nota.pdf"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
    },
  });
}

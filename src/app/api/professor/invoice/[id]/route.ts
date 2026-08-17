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
    select: {
      data: true,
      mimeType: true,
      professorId: true,
      competencia: true,
      professor: { select: { name: true } },
    },
  });
  if (!inv) return new Response("Nota fiscal não encontrada", { status: 404 });

  const isAdmin = roleAtLeast(membership.role, "ADMIN");
  const isOwner = professor?.id === inv.professorId;
  if (!isAdmin && !isOwner) {
    return new Response("Sem permissão", { status: 403 });
  }

  const bytes = new Uint8Array(inv.data);
  // Nome amigável pro download: "NF <Professor> <competencia>.pdf" — assim o
  // Anderson distingue os arquivos ao baixar vários de uma vez (antes vinha o
  // nome cru do upload, indistinguível).
  const label = `NF ${inv.professor.name} ${inv.competencia}.pdf`;
  const asciiName = label
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/["\\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const encodedName = encodeURIComponent(label);
  return new Response(bytes, {
    headers: {
      "Content-Type": inv.mimeType,
      "Content-Length": String(bytes.length),
      "Content-Disposition": `inline; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
      "Cache-Control": "private, no-store",
    },
  });
}

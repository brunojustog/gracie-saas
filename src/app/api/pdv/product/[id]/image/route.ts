/**
 * v1.2-AM: foto do produto (bytes no Postgres). Qualquer usuário do tenant
 * (staff que usa o PDV) pode ver. `id` = productId.
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

  const product = await prisma.product.findFirst({
    where: { id, tenantId: tenant.id },
    select: { imageData: true, imageMime: true },
  });
  if (!product?.imageData || !product.imageMime) {
    return new Response("Sem foto", { status: 404 });
  }

  const bytes = new Uint8Array(product.imageData);
  return new Response(bytes, {
    headers: {
      "Content-Type": product.imageMime,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=60",
    },
  });
}

import { prisma } from "@/lib/prisma";
import { requireProfessor } from "@/server/tenant";

import { ProfessorPerfilView } from "./perfil-view";

export default async function ProfessorPerfilPage() {
  const { tenant, user, professor } = await requireProfessor();

  if (!professor) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Perfil</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Seu usuário ({user.email}) ainda não está vinculado a um professor.
        </p>
      </main>
    );
  }

  const row = await prisma.professor.findUnique({
    where: { id: professor.id },
    select: { photoMime: true, email: true },
  });

  return (
    <ProfessorPerfilView
      professorId={professor.id}
      name={professor.name}
      email={row?.email ?? user.email}
      hasPhoto={row?.photoMime != null}
      isOwner={professor.isOwner}
      tenantName={tenant.name}
    />
  );
}

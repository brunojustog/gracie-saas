import { prisma } from "@/lib/prisma";
import { signOut } from "@/server/auth";
import { requireAluno } from "@/server/tenant";

import { PerfilView } from "./perfil-view";

export default async function PerfilPage() {
  const { tenant, user, aluno } = await requireAluno();
  if (!aluno) {
    return (
      <main className="gb-shell" style={{ paddingTop: 60, textAlign: "center" }}>
        <p style={{ color: "var(--muted)" }}>Acesso não vinculado a um aluno.</p>
      </main>
    );
  }

  const row = await prisma.aluno.findUnique({
    where: { id: aluno.id },
    select: {
      matricula: true,
      photoMime: true,
      lead: { select: { name: true, phone: true, email: true, belt: true, beltDegree: true } },
    },
  });

  const SignOut = (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      <button type="submit" className="gb-btn ghost" style={{ width: "100%", justifyContent: "center" }}>
        Sair da conta
      </button>
    </form>
  );

  return (
    <PerfilView
      alunoId={aluno.id}
      hasPhoto={row?.photoMime != null}
      name={row?.lead.name ?? aluno.name}
      matricula={aluno.matricula}
      email={row?.lead.email ?? user.email}
      phone={row?.lead.phone ?? ""}
      belt={row?.lead.belt ?? null}
      beltDegree={row?.lead.beltDegree ?? null}
      tenantName={tenant.name}
      signOutSlot={SignOut}
    />
  );
}

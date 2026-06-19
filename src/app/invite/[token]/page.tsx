import { getCurrentTenant } from "@/server/tenant";

import { checkInviteStatus } from "./actions";
import { InviteAcceptForm } from "./form";

type Params = Promise<{ token: string }>;

export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: Params }) {
  const { token } = await params;
  const status = await checkInviteStatus(token);
  const tenant = await getCurrentTenant();
  const tenantName = tenant?.name ?? "Gracie Barra Anália Franco";

  if (status.kind === "missing") {
    return (
      <Shell title="Convite inválido">
        Este link é inválido ou já foi utilizado. Peça pro admin enviar um novo
        convite.
      </Shell>
    );
  }

  if (status.kind === "expired") {
    return (
      <Shell title="Convite expirado">
        Esse convite expirou. Peça pro admin gerar um novo.
      </Shell>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <div className="w-full rounded-lg border bg-card p-8">
        <h1 className="mb-1 text-lg font-semibold">Bem-vinda(o) à {tenantName}</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Você foi convidada(o) com o email{" "}
          <span className="font-medium text-foreground">{status.identifier}</span>.
          Defina sua senha pra ativar o acesso.
        </p>
        <InviteAcceptForm token={token} />
      </div>
    </main>
  );
}

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center justify-center p-6">
      <div className="rounded-lg border bg-card p-8 text-center">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{children}</p>
      </div>
    </main>
  );
}

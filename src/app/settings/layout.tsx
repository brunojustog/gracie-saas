import { Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TopNav } from "@/components/top-nav";
import { signOut } from "@/server/auth";
import { requireRole } from "@/server/tenant";

import { SettingsNav } from "./nav";

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // v1.1-AH: o shell de /settings aceita qualquer membro do tenant — cada
  // página interna tem o próprio requireRole (planos = SELLER; o resto =
  // ADMIN), e a nav lateral filtra os itens por role. requireRole
  // redireciona pra /dashboard quem não cumprir.
  const { tenant, user, membership } = await requireRole("SELLER");

  return (
    <>
      <TopNav
        tenantName={tenant.name}
        tenantColor={tenant.primaryColor}
        userEmail={user.email}
        role={membership.role}
        signOutSlot={
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="outline" size="sm" className="h-8">
              Sair
            </Button>
          </form>
        }
      />
      <main className="mx-auto max-w-[1400px] px-4 py-4">
        <div className="mb-4 flex items-center gap-2">
          <Settings className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-lg font-semibold tracking-tight">Configurações</h1>
        </div>

        <div className="grid gap-6 md:grid-cols-[200px_1fr]">
          <SettingsNav role={membership.role} />
          <section>{children}</section>
        </div>
      </main>
    </>
  );
}

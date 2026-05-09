import {
  Calendar,
  GraduationCap,
  Kanban,
  LayoutGrid,
  MessageCircle,
  Settings,
  Tag,
  Users,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { signOut } from "@/server/auth";
import { requireRole } from "@/server/tenant";

import { SettingsNav } from "./nav";

const NAV = [
  { href: "/settings/modalidades", label: "Modalidades", icon: Tag },
  { href: "/settings/planos", label: "Planos", icon: GraduationCap },
  { href: "/settings/estagios", label: "Estágios do funil", icon: LayoutGrid },
  { href: "/settings/usuarios", label: "Usuários", icon: Users },
  { href: "/settings/chatwoot", label: "Integração Chatwoot", icon: MessageCircle },
];

export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Apenas ADMIN. requireRole redireciona pra /dashboard quem não cumprir.
  const { tenant, user, membership } = await requireRole("ADMIN");

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Settings className="h-5 w-5 text-muted-foreground" />
          <h1 className="text-xl font-semibold tracking-tight">Configurações</h1>
          <span className="text-xs text-muted-foreground">
            {tenant.name} · {membership.role.toLowerCase()}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              ← Dashboard
            </Button>
          </Link>
          <Link href="/kanban">
            <Button variant="outline" size="sm">
              <Kanban className="mr-1.5 h-4 w-4" /> Kanban
            </Button>
          </Link>
          <Link href="/aulas">
            <Button variant="outline" size="sm">
              <Calendar className="mr-1.5 h-4 w-4" /> Aulas
            </Button>
          </Link>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <Button type="submit" variant="ghost" size="sm">
              {user.email} · Sair
            </Button>
          </form>
        </div>
      </header>

      <div className="grid gap-6 md:grid-cols-[200px_1fr]">
        <SettingsNav items={NAV} />
        <section>{children}</section>
      </div>
    </main>
  );
}

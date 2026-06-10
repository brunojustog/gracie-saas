"use client";

import {
  Download,
  FileSpreadsheet,
  Globe,
  GraduationCap,
  LayoutGrid,
  MessageCircle,
  MessagesSquare,
  Smartphone,
  Tag,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@prisma/client";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { roleAtLeast } from "@/server/rbac";

/**
 * Navegação do /settings.
 *
 * O array `NAV_ITEMS` mora aqui (e não no Server Component pai) porque
 * cada item tem um componente React (`icon`) — passar componentes através
 * da fronteira RSC → client viola "Functions cannot be passed directly to
 * Client Components". Manter tudo client-side resolve.
 *
 * `minRole` (v1.1-AH) espelha o requireRole da página correspondente —
 * esconder o item aqui é cosmético; a autorização real é server-side.
 */
const NAV_ITEMS: Array<{
  href: string;
  label: string;
  icon: LucideIcon;
  minRole: Role;
}> = [
  { href: "/settings/modalidades", label: "Modalidades", icon: Tag, minRole: "ADMIN" },
  { href: "/settings/planos", label: "Planos", icon: GraduationCap, minRole: "SELLER" },
  { href: "/settings/estagios", label: "Estágios do funil", icon: LayoutGrid, minRole: "ADMIN" },
  { href: "/settings/usuarios", label: "Usuários", icon: Users, minRole: "ADMIN" },
  { href: "/settings/chatwoot", label: "Integração Chatwoot", icon: MessageCircle, minRole: "ADMIN" },
  { href: "/settings/chatwoot/import", label: "Importar do Chatwoot", icon: Download, minRole: "ADMIN" },
  { href: "/settings/wuzapi", label: "WhatsApp (Wuzapi)", icon: Smartphone, minRole: "ADMIN" },
  { href: "/settings/manychat", label: "Integração ManyChat", icon: MessagesSquare, minRole: "ADMIN" },
  { href: "/settings/site", label: "Leads do site (webhook)", icon: Globe, minRole: "ADMIN" },
  { href: "/settings/import-csv", label: "Importar planilhas (CSV)", icon: FileSpreadsheet, minRole: "ADMIN" },
  { href: "/settings/lixeira", label: "Lixeira (leads excluídos)", icon: Trash2, minRole: "ADMIN" },
];

export function SettingsNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const visibleItems = NAV_ITEMS.filter((item) => roleAtLeast(role, item.minRole));
  return (
    <nav className="flex flex-col gap-0.5 text-sm">
      {visibleItems.map((item) => {
        const Icon = item.icon;
        // Match exato pra rotas-mãe que têm sub-rotas (ex: /settings/chatwoot
        // vs /settings/chatwoot/import). Senão a mãe acende junto com a filha.
        const hasChild = NAV_ITEMS.some(
          (other) => other !== item && other.href.startsWith(`${item.href}/`),
        );
        const active = hasChild
          ? pathname === item.href
          : pathname?.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 transition-colors",
              active
                ? "bg-primary/10 text-primary font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

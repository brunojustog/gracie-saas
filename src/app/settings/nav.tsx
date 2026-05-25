"use client";

import {
  Download,
  FileSpreadsheet,
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
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Navegação do /settings.
 *
 * O array `NAV_ITEMS` mora aqui (e não no Server Component pai) porque
 * cada item tem um componente React (`icon`) — passar componentes através
 * da fronteira RSC → client viola "Functions cannot be passed directly to
 * Client Components". Manter tudo client-side resolve.
 */
const NAV_ITEMS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/settings/modalidades", label: "Modalidades", icon: Tag },
  { href: "/settings/planos", label: "Planos", icon: GraduationCap },
  { href: "/settings/estagios", label: "Estágios do funil", icon: LayoutGrid },
  { href: "/settings/usuarios", label: "Usuários", icon: Users },
  { href: "/settings/chatwoot", label: "Integração Chatwoot", icon: MessageCircle },
  { href: "/settings/chatwoot/import", label: "Importar do Chatwoot", icon: Download },
  { href: "/settings/wuzapi", label: "WhatsApp (Wuzapi)", icon: Smartphone },
  { href: "/settings/manychat", label: "Integração ManyChat", icon: MessagesSquare },
  { href: "/settings/import-csv", label: "Importar planilhas (CSV)", icon: FileSpreadsheet },
  { href: "/settings/lixeira", label: "Lixeira (leads excluídos)", icon: Trash2 },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5 text-sm">
      {NAV_ITEMS.map((item) => {
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

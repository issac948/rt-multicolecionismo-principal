"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Boxes,
  ShoppingCart,
  CalendarDays,
  ClipboardList,
  Layers,
  Package,
  Ticket,
  Settings,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/text";

const ITEMS: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/admin/dashboard", label: "Resumo", icon: BarChart3 },
  { href: "/admin/pedidos", label: "Pedidos", icon: ClipboardList },
  { href: "/admin/carrinhos", label: "Carrinhos ao vivo", icon: ShoppingCart },
  { href: "/admin/produtos", label: "Produtos", icon: Package },
  { href: "/admin/categorias", label: "Categorias", icon: Layers },
  { href: "/admin/cupons", label: "Cupons", icon: Ticket },
  { href: "/admin/estoque", label: "Estoque", icon: Boxes },
  { href: "/admin/eventos", label: "Eventos", icon: CalendarDays },
  { href: "/admin/clientes", label: "Clientes", icon: Users },
  { href: "/admin/ia", label: "Assistente de IA", icon: Sparkles },
  { href: "/admin/configuracoes", label: "Configurações", icon: Settings },
];

export function AdminNav() {
  const pathname = usePathname();

  return (
    <nav aria-label="Menu do painel">
      <ul className="flex gap-1 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-2 rounded px-3 font-semibold no-underline whitespace-nowrap",
                  active ? "bg-signal text-ink" : "text-white hover:bg-white/10",
                )}
              >
                <Icon size={18} aria-hidden />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

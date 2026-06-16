"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Cpu,
  Gauge,
  Monitor,
  Users,
  Tags,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/computadores", label: "Computadores", icon: Monitor },
  { href: "/funcionarios", label: "Funcionários", icon: Users },
  { href: "/tipos", label: "Tipos", icon: Tags },
  { href: "/auditoria", label: "Auditoria", icon: ScrollText },
];

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Marca({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/" className="flex items-center gap-2.5">
      <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground">
        <Cpu className="h-4 w-4" />
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="font-display text-sm font-bold tracking-tight">
            COBRATEC<span className="text-primary">·TI</span>
          </div>
          <div className="eyebrow mt-1">inventário de hardware</div>
        </div>
      )}
    </Link>
  );
}

// Rail lateral (desktop).
export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card md:flex">
      <div className="flex h-16 items-center border-b px-5">
        <Marca />
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
        {NAV.map((item) => {
          const on = ativo(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "group relative flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors",
                on
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {on && (
                <span className="absolute bottom-1.5 left-0 top-1.5 w-0.5 rounded-full bg-primary" />
              )}
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t px-5 py-3">
        <div className="eyebrow flex items-center gap-2">
          <span className="led text-emerald-500" /> LAN · uso interno
        </div>
      </div>
    </aside>
  );
}

// Barra superior (mobile).
export function TopBar() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-card px-4 py-3 md:hidden">
      <Marca compact />
      <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1">
        {NAV.map((item) => {
          const on = ativo(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs transition-colors",
                on
                  ? "bg-accent font-medium text-accent-foreground"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <item.icon className="h-3.5 w-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import {
  Boxes,
  Cpu,
  DoorOpen,
  Gauge,
  KeyRound,
  LifeBuoy,
  LogOut,
  Monitor,
  ShieldCheck,
  Smartphone,
  Users,
  Tags,
  ScrollText,
} from "lucide-react";
import { apiSend } from "@/lib/fetcher";
import { cn } from "@/lib/utils";

export type Papel = "ADMIN" | "OPERADOR";

// `operador: true` marca o que o OPERADOR também enxerga. O resto é só admin.
// Espelha a lista PERMITIDO_OPERADOR do middleware — quem muda um, muda o outro.
const NAV = [
  { href: "/", label: "Dashboard", icon: Gauge },
  { href: "/chamados", label: "Chamados", icon: LifeBuoy, operador: true },
  { href: "/computadores", label: "Computadores", icon: Monitor },
  { href: "/celulares", label: "Celulares", icon: Smartphone },
  { href: "/deposito", label: "Depósito", icon: Boxes },
  { href: "/funcionarios", label: "Funcionários", icon: Users },
  { href: "/salas", label: "Salas", icon: DoorOpen },
  { href: "/tipos", label: "Tipos", icon: Tags },
  { href: "/usuarios", label: "Usuários", icon: ShieldCheck },
  { href: "/auditoria", label: "Auditoria", icon: ScrollText },
];

function itens(papel: Papel) {
  return papel === "ADMIN" ? NAV : NAV.filter((i) => i.operador);
}

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

function useSair() {
  const router = useRouter();
  const [saindo, setSaindo] = React.useState(false);
  const sair = React.useCallback(async () => {
    setSaindo(true);
    try {
      await apiSend("/api/sessao", "DELETE");
    } finally {
      // Mesmo se a chamada falhar, mandamos para o login: o cookie pode já ter
      // expirado, e deixar a pessoa presa na tela seria pior.
      router.replace("/login");
      router.refresh();
    }
  }, [router]);
  return { sair, saindo };
}

// Rail lateral (desktop).
export function Sidebar({ papel, usuario }: { papel: Papel; usuario: string }) {
  const pathname = usePathname();
  const { sair, saindo } = useSair();
  return (
    <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-card md:flex">
      <div className="flex h-16 items-center border-b px-5">
        <Marca />
      </div>
      <nav className="flex-1 space-y-0.5 p-3">
        {itens(papel).map((item) => {
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
      <div className="space-y-2 border-t p-3">
        <div className="px-2">
          <div className="eyebrow">{papel === "ADMIN" ? "administrador" : "operador"}</div>
          <div className="truncate text-sm font-medium">{usuario}</div>
        </div>
        <div className="flex gap-1">
          <Link
            href="/trocar-senha"
            className="flex flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <KeyRound className="h-3.5 w-3.5" /> Senha
          </Link>
          <button
            type="button"
            onClick={sair}
            disabled={saindo}
            className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-60"
          >
            <LogOut className="h-3.5 w-3.5" /> Sair
          </button>
        </div>
      </div>
    </aside>
  );
}

// Barra superior (mobile).
export function TopBar({ papel, usuario }: { papel: Papel; usuario: string }) {
  const pathname = usePathname();
  const { sair, saindo } = useSair();
  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b bg-card px-4 py-3 md:hidden">
      <Marca compact />
      <nav className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1">
        {itens(papel).map((item) => {
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
      <button
        type="button"
        onClick={sair}
        disabled={saindo}
        title={`Sair (${usuario})`}
        aria-label={`Sair (${usuario})`}
        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-60"
      >
        <LogOut className="h-4 w-4" />
      </button>
    </header>
  );
}

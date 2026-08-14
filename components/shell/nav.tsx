"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import {
  Boxes,
  DoorOpen,
  Gauge,
  KeyRound,
  LifeBuoy,
  LogOut,
  MessageCircle,
  Monitor,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Wrench,
  Users,
  Tags,
  ScrollText,
} from "lucide-react";
import { apiSend } from "@/lib/fetcher";
import { AlternarTema } from "@/components/ui/tema";
import { ROTULO_PAPEL } from "@/lib/supervisao";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

export type { Papel } from "@/lib/supervisao";
import type { Papel } from "@/lib/supervisao";

// `operador`/`supervisor` marcam o que cada papel também enxerga. O resto é só
// admin. Espelha PERMITIDO_OPERADOR e PERMITIDO_SUPERVISOR do middleware —
// quem muda um, muda o outro.
//
// Fora do supervisor de propósito: Depósito (suprimentos não têm sala), Tipos
// (catálogo global), Usuários e Auditoria.
const NAV = [
  { href: "/", label: "Dashboard", icon: Gauge, supervisor: true },
  // O relatório de cobrança é a outra metade do "Dashboard": as duas telas
  // trocam entre si pelo alternador no cabeçalho. Fica no menu também porque
  // quem entra querendo o número do dia não deveria ter que passar pelo painel
  // de informática para chegar nele.
  { href: "/relatorios/cobranca", label: "Relatórios", icon: TrendingUp, supervisor: true },
  { href: "/chamados", label: "Chamados", icon: LifeBuoy, operador: true, supervisor: true },
  { href: "/computadores", label: "Computadores", icon: Monitor, supervisor: true },
  { href: "/celulares", label: "Celulares", icon: Smartphone, supervisor: true },
  { href: "/manutencoes", label: "Manutenções", icon: Wrench, supervisor: true },
  { href: "/deposito", label: "Depósito", icon: Boxes },
  { href: "/funcionarios", label: "Funcionários", icon: Users, supervisor: true },
  { href: "/salas", label: "Salas", icon: DoorOpen, supervisor: true },
  { href: "/tipos", label: "Tipos", icon: Tags },
  { href: "/usuarios", label: "Usuários", icon: ShieldCheck },
  { href: "/auditoria", label: "Auditoria", icon: ScrollText },
];

function itens(papel: Papel) {
  if (papel === "ADMIN") return NAV;
  if (papel === "SUPERVISOR") return NAV.filter((i) => i.supervisor);
  // COBRANCA cai aqui junto com OPERADOR de propósito: do inventário ela só usa
  // os chamados. O destino dela é o /chat, que não é item de menu — é o bloco
  // destacado logo acima do perfil (ver Sidebar).
  return NAV.filter((i) => i.operador);
}

/**
 * Quem alcança as conversas com devedor. Espelha `exigirChat`
 * (lib/autorizacao.ts) e PERMITIDO_COBRANCA (middleware.ts) — quem muda um,
 * muda os três. Supervisor de sala fica de fora: cobrança não é assunto de
 * sala.
 */
function podeChat(papel: Papel) {
  return papel === "ADMIN" || papel === "COBRANCA";
}

function ativo(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function Marca({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="Cobratec — inventário de hardware"
      className="flex items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {/* No mobile só o símbolo: o wordmark não cabe ao lado da navegação. */}
      {compact ? (
        <Logo markOnly className="h-7" />
      ) : (
        <>
          <Logo markOnly className="h-8" />
          <span className="leading-none">
            <Logo wordOnly className="block h-3.5" />
            <span className="eyebrow mt-1.5 block">inventário de hardware</span>
          </span>
        </>
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
      {/* Conversas fica FORA da lista de navegação, logo acima do perfil: não é
          uma tela a mais do inventário, é o outro ofício da casa. O destaque
          existe porque, para a operadora de cobrança, é a única porta que
          importa — e ela precisa cair nela sem procurar. */}
      {podeChat(papel) && (
        <div className="px-3 pb-2">
          <Link
            href="/chat"
            aria-current={ativo(pathname, "/chat") ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-lg border px-3 py-2.5 transition-colors",
              ativo(pathname, "/chat")
                ? "border-primary/40 bg-primary/10"
                : "bg-muted/40 hover:border-primary/30 hover:bg-primary/5",
            )}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
              <MessageCircle className="h-4 w-4" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-sm font-medium">Conversas</span>
              <span className="block truncate text-xs text-muted-foreground">
                WhatsApp · devedores
              </span>
            </span>
          </Link>
        </div>
      )}
      <div className="space-y-2 border-t p-3">
        <div className="flex items-center justify-between gap-2 px-2">
          <div className="min-w-0">
            <div className="eyebrow">{ROTULO_PAPEL[papel].toLowerCase()}</div>
            <div className="truncate text-sm font-medium">{usuario}</div>
          </div>
          <AlternarTema />
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
        {/* No mobile não existe rodapé de perfil para ficar "acima" dele, então
            Conversas vira o PRIMEIRO item da barra, destacado — mesma intenção
            do bloco do desktop: é a porta principal de quem atende. */}
        {podeChat(papel) && (
          <Link
            href="/chat"
            aria-current={ativo(pathname, "/chat") ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors",
              ativo(pathname, "/chat")
                ? "border-primary/40 bg-primary/10"
                : "bg-muted/40 hover:bg-primary/5",
            )}
          >
            <MessageCircle className="h-3.5 w-3.5 text-primary" />
            Conversas
          </Link>
        )}
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
      <AlternarTema className="shrink-0" />
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

"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

// Tema claro/escuro sem `next-themes`: são ~50 linhas e uma dependência a menos
// (o projeto é enxuto por princípio).
//
// Três estados e não dois: "sistema" respeita o que a máquina do analista já
// decidiu (inclusive a troca automática ao anoitecer). Só quem quer fixar um
// tema escolhe claro ou escuro.

export const CHAVE_TEMA = "cobratec-tema";

export type Tema = "claro" | "escuro" | "sistema";

type ContextoTema = {
  tema: Tema;
  definir: (t: Tema) => void;
};

const Contexto = React.createContext<ContextoTema | null>(null);

export function useTema(): ContextoTema {
  const ctx = React.useContext(Contexto);
  if (!ctx) throw new Error("useTema precisa estar dentro de <TemaProvider>");
  return ctx;
}

function escuroAgora(t: Tema): boolean {
  if (t === "sistema") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }
  return t === "escuro";
}

function aplicar(t: Tema): void {
  document.documentElement.classList.toggle("dark", escuroAgora(t));
}

/**
 * Roda ANTES da primeira pintura, injetado em <head>. Sem isso, a página nasce
 * clara e pisca para escura depois que o React monta — o "flash branco" que
 * incomoda justamente quem escolheu o tema escuro.
 */
export const SCRIPT_ANTI_FLASH = `
try {
  var t = localStorage.getItem('${CHAVE_TEMA}') || 'sistema';
  var escuro = t === 'escuro' || (t === 'sistema' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches);
  if (escuro) document.documentElement.classList.add('dark');
} catch (e) {}
`;

export function TemaProvider({ children }: { children: React.ReactNode }) {
  // Nasce em "sistema" para o servidor e o cliente renderizarem igual; o valor
  // salvo entra no efeito abaixo. O script do <head> já pintou a tela certa.
  const [tema, setTema] = React.useState<Tema>("sistema");

  React.useEffect(() => {
    const salvo = localStorage.getItem(CHAVE_TEMA) as Tema | null;
    if (salvo === "claro" || salvo === "escuro" || salvo === "sistema") {
      setTema(salvo);
    }
  }, []);

  // Em "sistema", seguir o SO enquanto a aba está aberta.
  React.useEffect(() => {
    aplicar(tema);
    if (tema !== "sistema") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const aoMudar = () => aplicar("sistema");
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, [tema]);

  const definir = React.useCallback((t: Tema) => {
    setTema(t);
    localStorage.setItem(CHAVE_TEMA, t);
  }, []);

  const valor = React.useMemo(() => ({ tema, definir }), [tema, definir]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

const OPCOES: { valor: Tema; rotulo: string; Icone: typeof Sun }[] = [
  { valor: "claro", rotulo: "Tema claro", Icone: Sun },
  { valor: "escuro", rotulo: "Tema escuro", Icone: Moon },
  { valor: "sistema", rotulo: "Seguir o sistema", Icone: Monitor },
];

export function AlternarTema({ className }: { className?: string }) {
  const { tema, definir } = useTema();
  return (
    <div
      role="group"
      aria-label="Tema da interface"
      className={cn("flex gap-0.5 rounded-md border p-0.5", className)}
    >
      {OPCOES.map(({ valor, rotulo, Icone }) => {
        const ativo = tema === valor;
        return (
          <button
            key={valor}
            type="button"
            onClick={() => definir(valor)}
            title={rotulo}
            aria-label={rotulo}
            aria-pressed={ativo}
            className={cn(
              "rounded-sm p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              ativo
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icone className="h-3.5 w-3.5" />
          </button>
        );
      })}
    </div>
  );
}

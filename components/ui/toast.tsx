"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Avisos curtos no canto da tela, no lugar do alert() nativo — que trava a aba
// inteira e não combina com o resto da interface. Escrito à mão para não trazer
// mais uma dependência só por isso.

export type VarianteToast = "info" | "sucesso" | "erro";

type Toast = {
  id: number;
  titulo?: string;
  descricao: string;
  variante: VarianteToast;
};

type NovoToast = {
  titulo?: string;
  descricao: string;
  variante?: VarianteToast;
  /** Milissegundos até sumir sozinho. `0` mantém até o clique no X. */
  duracao?: number;
};

type ContextoToast = {
  toast: (t: NovoToast) => void;
  /** Atalho para o caso mais comum: erro vindo de uma chamada de API. */
  toastErro: (descricao: string) => void;
};

const Contexto = React.createContext<ContextoToast | null>(null);

const DURACAO_PADRAO = 5000;

export function useToast(): ContextoToast {
  const ctx = React.useContext(Contexto);
  if (!ctx) throw new Error("useToast precisa estar dentro de <ToastProvider>");
  return ctx;
}

const ESTILO: Record<VarianteToast, { classe: string; Icone: typeof Info }> = {
  info: { classe: "border-border bg-card text-card-foreground", Icone: Info },
  sucesso: {
    classe:
      "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
    Icone: CheckCircle2,
  },
  erro: {
    classe:
      "border-destructive/40 bg-destructive/10 text-foreground dark:bg-destructive/20",
    Icone: AlertTriangle,
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  // Um id crescente em ref: dois toasts disparados no mesmo tick precisam de
  // chaves distintas, e um contador em estado não teria atualizado a tempo.
  const proximoId = React.useRef(1);

  const remover = React.useCallback((id: number) => {
    setToasts((atuais) => atuais.filter((t) => t.id !== id));
  }, []);

  const toast = React.useCallback(
    ({ titulo, descricao, variante = "info", duracao = DURACAO_PADRAO }: NovoToast) => {
      const id = proximoId.current++;
      setToasts((atuais) => [...atuais, { id, titulo, descricao, variante }]);
      if (duracao > 0) {
        setTimeout(() => remover(id), duracao);
      }
    },
    [remover],
  );

  const toastErro = React.useCallback(
    (descricao: string) => toast({ descricao, variante: "erro" }),
    [toast],
  );

  const valor = React.useMemo(() => ({ toast, toastErro }), [toast, toastErro]);

  return (
    <Contexto.Provider value={valor}>
      {children}
      {/* `polite` para não interromper o leitor de tela no meio de outra fala. */}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
      >
        {toasts.map((t) => {
          const { classe, Icone } = ESTILO[t.variante];
          return (
            <div
              key={t.id}
              role={t.variante === "erro" ? "alert" : "status"}
              className={cn(
                "pointer-events-auto flex items-start gap-2.5 rounded-md border p-3 shadow-md",
                "animate-in fade-in-0 slide-in-from-bottom-2",
                classe,
              )}
            >
              <Icone className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 flex-1 text-sm">
                {t.titulo && <div className="font-medium">{t.titulo}</div>}
                <div className={cn(t.titulo && "text-xs opacity-90")}>
                  {t.descricao}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remover(t.id)}
                aria-label="Fechar aviso"
                className="shrink-0 rounded-sm opacity-60 transition-opacity hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </Contexto.Provider>
  );
}

"use client";

import * as React from "react";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

// Par login/senha do cofre interno de TI.
//
// A senha nasce escondida não por criptografia (ela está em texto no banco, é o
// propósito do cofre — decisão 8), mas porque a tela é aberta na frente de
// outras pessoas: ninguém precisa ver a senha de todo mundo ao rolar a página.
// Copiar sem revelar cobre o caso mais comum, que é colar em outro sistema.

export function Credencial({
  rotulo,
  login,
  senha,
}: {
  rotulo: string;
  login: string | null;
  senha: string | null;
}) {
  const [revelada, setRevelada] = React.useState(false);
  const [copiado, setCopiado] = React.useState<"login" | "senha" | null>(null);

  if (!login && !senha) return null;

  async function copiar(valor: string, qual: "login" | "senha") {
    try {
      await navigator.clipboard.writeText(valor);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 1500);
    } catch {
      // Sem permissão de clipboard (contexto não seguro): revelar já resolve,
      // a pessoa copia na mão. Silenciar aqui é melhor que um erro inútil.
      setRevelada(true);
    }
  }

  return (
    <div className="rounded-md border p-3">
      <div className="eyebrow">{rotulo}</div>
      <dl className="mt-1.5 space-y-1 text-sm">
        {login && (
          <div className="flex items-center gap-2">
            <dt className="w-14 shrink-0 text-xs text-muted-foreground">login</dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-xs">{login}</dd>
            <BotaoCopiar
              rotulo={`Copiar login ${rotulo}`}
              copiado={copiado === "login"}
              onClick={() => copiar(login, "login")}
            />
          </div>
        )}
        {senha && (
          <div className="flex items-center gap-2">
            <dt className="w-14 shrink-0 text-xs text-muted-foreground">senha</dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-xs">
              {revelada ? senha : "••••••••"}
            </dd>
            <button
              type="button"
              onClick={() => setRevelada((v) => !v)}
              aria-label={revelada ? `Ocultar senha ${rotulo}` : `Mostrar senha ${rotulo}`}
              aria-pressed={revelada}
              className="shrink-0 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {revelada ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
            <BotaoCopiar
              rotulo={`Copiar senha ${rotulo}`}
              copiado={copiado === "senha"}
              onClick={() => copiar(senha, "senha")}
            />
          </div>
        )}
      </dl>
    </div>
  );
}

function BotaoCopiar({
  rotulo,
  copiado,
  onClick,
}: {
  rotulo: string;
  copiado: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={rotulo}
      title={rotulo}
      className={cn(
        "shrink-0 rounded-sm p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        copiado
          ? "text-emerald-600 dark:text-emerald-400"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {copiado ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

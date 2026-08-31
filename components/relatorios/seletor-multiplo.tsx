"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// O filtro que aceita mais de um (decisão 39).
//
// ─────────────────────── por que um diálogo, e não um menu ───────────────────────
//
// O `Select` do projeto é Radix, e Radix Select não faz multi-seleção. O
// caminho canônico seria Popover + Command, e nenhum dos dois existe em
// `components/ui/` — entrariam duas dependências para desenhar uma caixa com
// checkbox dentro.
//
// O padrão já estava pronto em `components/salas/trazer-dialog.tsx`: diálogo com
// busca, checkbox e ação em lote, que é exatamente esta interação. Ele também é
// o certo pelo tamanho da lista — 191 carteiras e 353 operadoras não cabem num
// menu suspenso, e sem campo de busca ninguém acha a linha que procura.
//
// ────────────────────────── a seleção é confirmada ──────────────────────────
//
// O rascunho vive dentro do diálogo e só sobe no "Aplicar". Marcar três
// carteiras com aplicação imediata seriam TRÊS trocas de URL e três idas ao CRM,
// as duas primeiras jogadas fora — e o painel piscando entre recortes que a
// pessoa não pediu.

export type Opcao = {
  valor: string;
  rotulo: string;
  /** Linha de baixo: equipe da operadora, nº de membros, o que desempata. */
  nota?: string;
};

type Props = {
  /** O que é filtrado, em minúsculas: "carteira", "equipe", "operadora". */
  rotulo: string;
  /** O texto de "nenhum filtro": "Todas as carteiras". */
  rotuloTodos: string;
  opcoes: Opcao[];
  /** Vazio = todas. */
  selecionados: string[];
  /** Chamado UMA vez, no Aplicar — uma troca de URL por escolha. */
  aoAplicar: (valores: string[]) => void;
  /** Teto de itens; o mesmo `MAX_CODIGOS` que a API cobra. */
  max: number;
  className?: string;
};

/** Ordem estável para códigos numéricos e ids de texto na mesma lista. */
function ordenar(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b, "pt-BR");
}

/** O que o gatilho mostra: nome quando é um, contagem quando são vários. */
function resumo(
  selecionados: string[],
  opcoes: Opcao[],
  rotulo: string,
  rotuloTodos: string,
): string {
  if (selecionados.length === 0) return rotuloTodos;
  if (selecionados.length === 1) {
    // O nome, e não o código — mas só se a lista já chegou. Enquanto ela carrega
    // (ou se a consulta falhou), mostrar o código cru é mais honesto que mostrar
    // "1 carteira" para uma escolha que a pessoa fez pelo nome.
    const achado = opcoes.find((o) => o.valor === selecionados[0]);
    return achado ? achado.rotulo : `${rotulo} ${selecionados[0]}`;
  }
  return `${selecionados.length} ${rotulo}s`;
}

export function SeletorMultiplo({
  rotulo,
  rotuloTodos,
  opcoes,
  selecionados,
  aoAplicar,
  max,
  className,
}: Props) {
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [rascunho, setRascunho] = React.useState<Set<string>>(new Set());

  // Ao abrir, o rascunho parte do que está valendo. Ao fechar sem aplicar, ele
  // é descartado — abrir de novo mostra a URL, não a desistência anterior.
  React.useEffect(() => {
    if (aberto) {
      setRascunho(new Set(selecionados));
      setBusca("");
    }
  }, [aberto, selecionados]);

  const filtradas = React.useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return opcoes;
    return opcoes.filter(
      (o) =>
        o.rotulo.toLowerCase().includes(t) ||
        o.nota?.toLowerCase().includes(t) ||
        o.valor === t,
    );
  }, [opcoes, busca]);

  const alternar = (valor: string) =>
    setRascunho((s) => {
      const novo = new Set(s);
      if (novo.has(valor)) novo.delete(valor);
      else if (novo.size < max) novo.add(valor);
      return novo;
    });

  const noTeto = rascunho.size >= max;
  const texto = resumo(selecionados, opcoes, rotulo, rotuloTodos);
  const ativo = selecionados.length > 0;

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn(
            "w-full justify-between gap-2 font-normal",
            ativo && "border-primary/50",
            className,
          )}
          aria-label={`Filtrar por ${rotulo}: ${texto}`}
        >
          <span className="truncate">{texto}</span>
          <span className="flex shrink-0 items-center gap-1">
            {selecionados.length > 1 && (
              <span className="rounded bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary">
                {selecionados.length}
              </span>
            )}
            <ChevronsUpDown className="h-3.5 w-3.5 opacity-50" />
          </span>
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="capitalize">{rotulo}</DialogTitle>
          <DialogDescription>
            Marque quantas quiser. Sem nenhuma marcada, o relatório traz{" "}
            {rotuloTodos.toLowerCase()}.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={`Buscar ${rotulo}...`}
            className="pl-8"
          />
        </div>

        {opcoes.length === 0 ? (
          // A lista vem do CRM e pode não ter chegado. Dizer isso é melhor que
          // uma caixa vazia, que se lê como "não existe nenhuma carteira".
          <p className="py-6 text-center text-sm text-muted-foreground">
            A lista de {rotulo}s não foi carregada. O relatório continua
            funcionando sem este filtro.
          </p>
        ) : (
          <ul
            role="group"
            aria-label={`Opções de ${rotulo}`}
            className="max-h-72 space-y-0.5 overflow-y-auto rounded-md border p-1"
          >
            {filtradas.length === 0 && (
              <li className="px-2 py-6 text-center text-sm text-muted-foreground">
                Nada encontrado para “{busca}”.
              </li>
            )}
            {filtradas.map((o) => {
              const marcado = rascunho.has(o.valor);
              return (
                <li key={o.valor}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-2 rounded p-1.5 text-sm hover:bg-muted",
                      marcado && "bg-muted",
                      // No teto, o que já está marcado continua clicável (para
                      // desmarcar); o que não está fica claramente indisponível.
                      !marcado && noTeto && "cursor-not-allowed opacity-40",
                    )}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4"
                      checked={marcado}
                      disabled={!marcado && noTeto}
                      onChange={() => alternar(o.valor)}
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {o.rotulo}
                      </span>
                      {o.nota && (
                        <span className="block truncate text-xs text-muted-foreground">
                          {o.nota}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {noTeto && (
          <p className="text-xs text-muted-foreground">
            Máximo de {max} por filtro. Para um recorte maior, deixe em “
            {rotuloTodos.toLowerCase()}”.
          </p>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRascunho(new Set())}
            disabled={rascunho.size === 0}
          >
            <X className="mr-1.5 h-3.5 w-3.5" />
            Limpar
          </Button>
          <span className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAberto(false)}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => {
                // Ordem estável: a URL de um mesmo recorte é sempre a mesma
                // string, independentemente da ordem dos cliques. É o que faz
                // dois links do mesmo recorte serem o mesmo link.
                //
                // Numérica quando os dois são números (códigos do Siscobra),
                // alfabética no resto (cuid do inventário e sentinelas como
                // "sem"): `Number("clx…")` é NaN, e comparar NaN devolve sempre
                // false — a ordenação viraria silenciosamente um no-op.
                aoAplicar([...rascunho].sort(ordenar));
                setAberto(false);
              }}
            >
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Aplicar
              {rascunho.size > 0 && ` (${rascunho.size})`}
            </Button>
          </span>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

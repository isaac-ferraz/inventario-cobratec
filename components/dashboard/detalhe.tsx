"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Inbox } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Detalhe de um indicador do Dashboard.
//
// Clicar num número abre o pop-up com QUAIS registros estão por trás dele, sem
// sair da tela: o analista quase sempre quer só conferir a lista e voltar para o
// painel. Quem precisa agir usa o link discreto do rodapé, que leva à tela
// completa (com edição, filtros e o resto) já no mesmo recorte.
//
// Os itens vêm prontos do servidor — a página já carrega computadores, celulares
// e chamados para calcular os números, então abrir o pop-up não custa uma ida
// nova ao banco.

import type { ItemDetalhe } from "./tipos";

export function DetalheDialog({
  aberto,
  onOpenChange,
  titulo,
  descricao,
  itens,
  total,
  href,
  rotuloHref,
}: {
  aberto: boolean;
  onOpenChange: (v: boolean) => void;
  titulo: string;
  descricao?: string;
  itens: ItemDetalhe[];
  total: number;
  href: string;
  rotuloHref: string;
}) {
  const cortados = total - itens.length;

  return (
    <Dialog open={aberto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-lg gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="font-display">
            {titulo}
            <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
              {total}
            </span>
          </DialogTitle>
          {descricao && <DialogDescription>{descricao}</DialogDescription>}
        </DialogHeader>

        {itens.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Inbox className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nada por aqui.</p>
          </div>
        ) : (
          <ul className="-mx-1 max-h-[50vh] divide-y overflow-y-auto px-1">
            {itens.map((i) => {
              const conteudo = (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {i.titulo}
                    </span>
                    {i.subtitulo && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {i.subtitulo}
                      </span>
                    )}
                  </span>
                  {i.etiqueta && (
                    <Badge variant="secondary" className="shrink-0">
                      {i.etiqueta}
                    </Badge>
                  )}
                </>
              );
              return (
                <li key={i.id}>
                  {i.href ? (
                    <Link
                      href={i.href}
                      onClick={() => onOpenChange(false)}
                      className="flex items-center gap-2 rounded-sm px-2 py-2 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {conteudo}
                    </Link>
                  ) : (
                    <span className="flex items-center gap-2 px-2 py-2">
                      {conteudo}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* O caminho para a tela completa fica pequeno de propósito: o pop-up já
            responde "quais?", que é a pergunta de 90% dos cliques. */}
        <div className="flex items-center justify-between gap-2 border-t pt-3">
          {cortados > 0 ? (
            <span className="text-xs text-muted-foreground">
              + {cortados} não mostrado(s)
            </span>
          ) : (
            <span />
          )}
          <Link
            href={href}
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
          >
            {rotuloHref} <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Envolve qualquer conteúdo num gatilho de pop-up. Usado pelos cards, barras e
 * pendências do Dashboard — o visual continua vivendo em cada um deles.
 */
export function GatilhoDetalhe({
  titulo,
  descricao,
  itens,
  total,
  href,
  rotuloHref = "abrir a lista completa",
  rotuloAcessivel,
  className,
  children,
}: {
  titulo: string;
  descricao?: string;
  itens: ItemDetalhe[];
  total: number;
  href: string;
  rotuloHref?: string;
  rotuloAcessivel: string;
  className?: string;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        aria-label={rotuloAcessivel}
        aria-haspopup="dialog"
        className={cn(
          "w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className,
        )}
      >
        {children}
      </button>
      <DetalheDialog
        aberto={aberto}
        onOpenChange={setAberto}
        titulo={titulo}
        descricao={descricao}
        itens={itens}
        total={total}
        href={href}
        rotuloHref={rotuloHref}
      />
    </>
  );
}

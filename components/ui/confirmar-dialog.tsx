"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Confirmação no lugar do confirm() nativo. A API é uma Promise<boolean> para
// que cada chamada continue cabendo em uma linha na tela que a usa:
//
//   if (!(await confirmar({ titulo: "Remover?", ... }))) return;

type PedidoConfirmacao = {
  titulo: string;
  descricao?: string;
  /** Rótulo do botão que confirma. Padrão: "Confirmar". */
  confirmar?: string;
  cancelar?: string;
  /** Ação destrutiva pinta o botão de vermelho. Padrão: true. */
  destrutivo?: boolean;
};

type ContextoConfirmar = (pedido: PedidoConfirmacao) => Promise<boolean>;

const Contexto = React.createContext<ContextoConfirmar | null>(null);

export function useConfirmar(): ContextoConfirmar {
  const ctx = React.useContext(Contexto);
  if (!ctx)
    throw new Error("useConfirmar precisa estar dentro de <ConfirmarProvider>");
  return ctx;
}

export function ConfirmarProvider({ children }: { children: React.ReactNode }) {
  const [pedido, setPedido] = React.useState<PedidoConfirmacao | null>(null);
  // Guarda o `resolve` da Promise em aberto. Fica em ref porque quem resolve é
  // o clique do usuário, muito depois do render que criou a Promise.
  const resolverRef = React.useRef<((ok: boolean) => void) | null>(null);

  const confirmar = React.useCallback(
    (novo: PedidoConfirmacao) =>
      new Promise<boolean>((resolve) => {
        // Se já houver um pedido na tela, o anterior é descartado como "não".
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setPedido(novo);
      }),
    [],
  );

  const responder = React.useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setPedido(null);
  }, []);

  return (
    <Contexto.Provider value={confirmar}>
      {children}
      <Dialog
        open={pedido !== null}
        // Fechar por Esc, clique fora ou no X equivale a cancelar — sem isso a
        // Promise ficaria pendurada para sempre e a tela travaria em "removendo".
        onOpenChange={(aberto) => {
          if (!aberto) responder(false);
        }}
      >
        <DialogContent className="max-w-md">
          {pedido && (
            <>
              <DialogHeader>
                <DialogTitle className="font-display">{pedido.titulo}</DialogTitle>
                {pedido.descricao && (
                  <DialogDescription>{pedido.descricao}</DialogDescription>
                )}
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => responder(false)}>
                  {pedido.cancelar ?? "Cancelar"}
                </Button>
                <Button
                  variant={pedido.destrutivo === false ? "default" : "destructive"}
                  onClick={() => responder(true)}
                  autoFocus
                >
                  {pedido.confirmar ?? "Confirmar"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </Contexto.Provider>
  );
}

"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Rodapé das listas paginadas. Mostra sempre quanto já está na tela do total —
// sem isso, "carregar mais" some quando acaba e a pessoa fica sem saber se viu
// tudo ou se a lista quebrou.
export function CarregarMais({
  mostrando,
  total,
  temMais,
  carregando,
  onCarregarMais,
  rotulo,
}: {
  mostrando: number;
  total: number;
  temMais: boolean;
  carregando: boolean;
  onCarregarMais: () => void;
  /** Nome do que está sendo listado, no plural. Ex.: "chamados". */
  rotulo: string;
}) {
  if (total === 0) return null;
  return (
    <div className="flex flex-col items-center gap-2 pt-2">
      <p className="text-xs text-muted-foreground">
        {temMais
          ? `Mostrando ${mostrando} de ${total} ${rotulo}.`
          : `${total} ${rotulo} no total.`}
      </p>
      {temMais && (
        <Button
          variant="outline"
          size="sm"
          onClick={onCarregarMais}
          disabled={carregando}
        >
          {carregando ? (
            <Loader2 className="animate-spin" />
          ) : (
            <ChevronDown />
          )}
          Carregar mais
        </Button>
      )}
    </div>
  );
}

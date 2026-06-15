"use client";

import {
  Cpu,
  Headphones,
  Keyboard,
  Loader2,
  Mouse,
  PackageOpen,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Componente, Computador } from "./types";

type Props = {
  computador: Computador;
  removendoPcId: string | null;
  removendoCompId: string | null;
  onEditar: (c: Computador) => void;
  onRemover: (c: Computador) => void;
  onNovoComp: (pcId: string) => void;
  onEditarComp: (pcId: string, comp: Componente) => void;
  onRemoverComp: (comp: Componente) => void;
};

export function ComputadorCard({
  computador: c,
  removendoPcId,
  removendoCompId,
  onEditar,
  onRemover,
  onNovoComp,
  onEditarComp,
  onRemoverComp,
}: Props) {
  const temDados =
    c.loginPadrao || c.contaOutlook || c.licencaWindows || c.licencaMicrosoft;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Cpu className="h-4 w-4" />
              {c.identificador}
            </CardTitle>
            {c.apelido && (
              <p className="mt-1 text-sm text-muted-foreground">{c.apelido}</p>
            )}
          </div>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              title="Editar / mover"
              aria-label={`Editar ${c.identificador}`}
              onClick={() => onEditar(c)}
            >
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Remover"
              aria-label={`Remover ${c.identificador}`}
              disabled={removendoPcId === c.id}
              onClick={() => onRemover(c)}
            >
              {removendoPcId === c.id ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Trash2 className="text-destructive" />
              )}
            </Button>
          </div>
        </div>
        <div className="mt-1">
          {c.funcionario ? (
            <Badge variant="secondary">
              {c.funcionario.nome} · {c.funcionario.cargo}
            </Badge>
          ) : (
            <Badge variant="warning">
              <PackageOpen className="mr-1 h-3 w-3" /> Sem funcionário (estoque)
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {temDados && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border bg-muted/30 p-2 text-xs">
            {c.loginPadrao && (
              <>
                <dt className="text-muted-foreground">Login</dt>
                <dd className="font-medium">{c.loginPadrao}</dd>
              </>
            )}
            {c.contaOutlook && (
              <>
                <dt className="text-muted-foreground">Outlook</dt>
                <dd className="break-all font-medium">{c.contaOutlook}</dd>
              </>
            )}
            {c.licencaWindows && (
              <>
                <dt className="text-muted-foreground">Windows</dt>
                <dd className="break-all font-medium">{c.licencaWindows}</dd>
              </>
            )}
            {c.licencaMicrosoft && (
              <>
                <dt className="text-muted-foreground">Microsoft</dt>
                <dd className="break-all font-medium">{c.licencaMicrosoft}</dd>
              </>
            )}
          </dl>
        )}
        <div className="flex flex-wrap gap-1">
          <Badge variant={c.temMouse ? "secondary" : "outline"}>
            <Mouse className="mr-1 h-3 w-3" /> Mouse
            {c.temMouse ? "" : " ✕"}
          </Badge>
          <Badge variant={c.temTeclado ? "secondary" : "outline"}>
            <Keyboard className="mr-1 h-3 w-3" /> Teclado
            {c.temTeclado ? "" : " ✕"}
          </Badge>
          <Badge variant={c.temHeadset ? "secondary" : "outline"}>
            <Headphones className="mr-1 h-3 w-3" /> Headset
            {c.temHeadset ? "" : " ✕"}
          </Badge>
        </div>
        {c.observacoes && (
          <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
            {c.observacoes}
          </p>
        )}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Hardware ({c.componentes.length})
            </span>
            <Button variant="outline" size="sm" onClick={() => onNovoComp(c.id)}>
              <Plus /> Componente
            </Button>
          </div>
          {c.componentes.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum componente registrado.
            </p>
          ) : (
            <ul className="divide-y rounded-md border">
              {c.componentes.map((comp) => (
                <li
                  key={comp.id}
                  className="flex items-start justify-between gap-2 p-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm">
                      <span className="font-medium">{comp.tipo.nome}:</span>{" "}
                      {comp.descricao}
                    </div>
                    {comp.especificacoes &&
                      Object.keys(comp.especificacoes).length > 0 && (
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {Object.entries(comp.especificacoes).map(([k, v]) => (
                            <Badge
                              key={k}
                              variant="outline"
                              className="text-[10px]"
                            >
                              {k}: {String(v)}
                            </Badge>
                          ))}
                        </div>
                      )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Editar componente ${comp.tipo.nome}`}
                      title="Editar componente"
                      onClick={() => onEditarComp(c.id, comp)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      aria-label={`Remover componente ${comp.tipo.nome}`}
                      title="Remover componente"
                      disabled={removendoCompId === comp.id}
                      onClick={() => onRemoverComp(comp)}
                    >
                      {removendoCompId === comp.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      )}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

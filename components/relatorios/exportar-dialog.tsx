"use client";

import * as React from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { ABAS, type AbaChave, type Papel } from "@/lib/relatorios-abas";
import { cn } from "@/lib/utils";

// O diálogo que monta a planilha (decisão 39).
//
// ─────────────────── ele herda o filtro, não o pergunta de novo ───────────────────
//
// O recorte já está na URL, porque a pessoa acabou de montá-lo na tela. Repetir
// os seletores aqui criaria duas verdades sobre o mesmo recorte e a chance de
// exportar um filtro diferente do que está na tela — que é exatamente o erro que
// a aba "Parâmetros" existe para tornar visível. O diálogo escolhe só as ABAS, e
// mostra o recorte herdado em texto para a pessoa conferir antes de baixar.
//
// ─────────────────────────── a lista vem do servidor ───────────────────────────
//
// `ABAS` é o mesmo módulo que a rota usa para autorizar. Se a tela tivesse a sua
// própria lista, uma das duas ficaria para trás — e o sintoma seria uma caixinha
// que sempre devolve 403.

type Props = {
  papel: Papel;
  /** A query string dos filtros correntes, já montada pelo painel. */
  consulta: string;
  /** O recorte em uma frase, para a pessoa conferir. */
  recorte: string | null;
  /** O período/janela por extenso. */
  periodo: string;
  /** Abas sugeridas por esta tela — cobrança sugere as suas, carteira as dela. */
  sugeridas?: AbaChave[];
};

export function ExportarDialog({
  papel,
  consulta,
  recorte,
  periodo,
  sugeridas,
}: Props) {
  const disponiveis = React.useMemo(
    () => ABAS.filter((a) => a.papeis.includes(papel) && a.chave !== "parametros"),
    [papel],
  );

  const padrao = React.useMemo(() => {
    const base = sugeridas?.length
      ? disponiveis.filter((a) => sugeridas.includes(a.chave))
      : disponiveis.filter((a) => a.padrao);
    return new Set(base.map((a) => a.chave));
  }, [disponiveis, sugeridas]);

  const { toastErro } = useToast();
  const [aberto, setAberto] = React.useState(false);
  const [escolhidas, setEscolhidas] = React.useState<Set<AbaChave>>(padrao);
  const [baixando, setBaixando] = React.useState(false);

  React.useEffect(() => {
    if (aberto) setEscolhidas(new Set(padrao));
  }, [aberto, padrao]);

  const alternar = (c: AbaChave) =>
    setEscolhidas((s) => {
      const novo = new Set(s);
      if (novo.has(c)) novo.delete(c);
      else novo.add(c);
      return novo;
    });

  async function baixar() {
    setBaixando(true);
    try {
      const p = new URLSearchParams(consulta);
      p.set("abas", [...escolhidas].join(","));
      const res = await fetch(`/api/relatorios/exportar?${p.toString()}`);
      if (!res.ok) {
        // A rota recusa NOMEANDO a aba fora do alcance; mostrar essa frase é o
        // que transforma o 403 em algo acionável.
        const corpo = await res.json().catch(() => null);
        throw new Error(
          (corpo as { erro?: string } | null)?.erro ??
            "Não foi possível gerar a planilha.",
        );
      }
      const blob = await res.blob();
      // O nome vem do `Content-Disposition`, que carrega o período — ao contrário
      // do botão do inventário, que o recalcula no cliente e por isso pode
      // divergir do que o servidor gerou.
      const disp = res.headers.get("Content-Disposition") ?? "";
      const nome = /filename="([^"]+)"/.exec(disp)?.[1] ?? "cobranca.xlsx";
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nome;
      a.click();
      URL.revokeObjectURL(url);
      setAberto(false);
    } catch (e) {
      toastErro((e as Error).message);
    } finally {
      setBaixando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Excel
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Exportar para Excel</DialogTitle>
          <DialogDescription>
            Cada aba marcada é uma consulta ao CRM. Marque o que vai usar.
          </DialogDescription>
        </DialogHeader>

        {/* O recorte herdado, à vista. É a mesma frase que vai para a capa da
            planilha — se ela estiver errada aqui, estará errada lá. */}
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <span className="eyebrow block">o que vai na planilha</span>
          <span className="font-medium">{periodo}</span>
          {recorte ? (
            <span className="text-muted-foreground"> · {recorte}</span>
          ) : (
            <span className="text-muted-foreground"> · sem filtro (tudo)</span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="eyebrow">abas</span>
          <span className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEscolhidas(new Set(disponiveis.map((a) => a.chave)))}
            >
              Marcar todas
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setEscolhidas(new Set())}
            >
              Limpar
            </Button>
          </span>
        </div>

        <ul className="max-h-80 space-y-0.5 overflow-y-auto rounded-md border p-1">
          {disponiveis.map((a) => {
            const marcada = escolhidas.has(a.chave);
            return (
              <li key={a.chave}>
                <label
                  className={cn(
                    "flex cursor-pointer items-start gap-2 rounded p-1.5 text-sm hover:bg-muted",
                    marcada && "bg-muted",
                  )}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4"
                    checked={marcada}
                    onChange={() => alternar(a.chave)}
                  />
                  <span className="min-w-0">
                    <span className="block font-medium">{a.nome}</span>
                    <span className="block text-xs text-muted-foreground">
                      {a.descricao}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <p className="text-xs text-muted-foreground">
          A aba <strong>Parâmetros</strong> entra sempre: ela guarda o recorte, quem
          exportou e as ressalvas de método. Sem ela a planilha vira um número sem
          dono na primeira vez que alguém a encaminha.
        </p>

        <DialogFooter>
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
            onClick={baixar}
            disabled={escolhidas.size === 0 || baixando}
          >
            {baixando ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-3.5 w-3.5" />
            )}
            {baixando ? "Gerando..." : `Baixar (${escolhidas.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

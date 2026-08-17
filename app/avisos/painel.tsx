"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCheck, Clock, RefreshCw, Trash2 } from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useConfirmar } from "@/components/ui/confirmar-dialog";
import { cn } from "@/lib/utils";

type Aviso = {
  id: string;
  tipo: string;
  nivel: string;
  titulo: string;
  corpo: string;
  link: string | null;
  entrega: string | null;
  lidoEm: string | null;
  criadoEm: string;
};

type TarefaInfo = {
  nome: string;
  ultimoDia: string | null;
  ultimaExecucao: string | null;
  ultimoResultado: string | null;
  ultimoDetalhe: string | null;
  duracaoMs: number | null;
};

type Resposta = { avisos: Aviso[]; pendentes: number; tarefas: TarefaInfo[] };

const TOM: Record<string, string> = {
  info: "border-l-muted-foreground/40",
  alerta: "border-l-amber-500",
  grave: "border-l-red-500",
};

function quando(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PainelAvisos() {
  const router = useRouter();
  const { toast, toastErro } = useToast();
  const confirmar = useConfirmar();
  const [dados, setDados] = React.useState<Resposta | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [tentativa, setTentativa] = React.useState(0);

  React.useEffect(() => {
    let vivo = true;
    setCarregando(true);
    apiGet<Resposta>("/api/avisos")
      .then((r) => {
        if (!vivo) return;
        setDados(r);
        setErro(null);
      })
      .catch((e) => vivo && setErro(mensagem(e)))
      .finally(() => vivo && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  async function marcarTudo() {
    try {
      await apiSend("/api/avisos", "POST");
      setTentativa((t) => t + 1);
      // O contador do menu é desenhado no servidor (app/layout.tsx); sem o
      // refresh ele continuaria mostrando o número velho até a próxima
      // navegação completa.
      router.refresh();
    } catch (e) {
      toastErro(mensagem(e));
    }
  }

  async function limparLidos() {
    if (
      !(await confirmar({
        titulo: "Remover os avisos já lidos?",
        descricao: "Os pendentes continuam na lista. Isto não pode ser desfeito.",
        confirmar: "Remover",
        destrutivo: true,
      }))
    ) {
      return;
    }
    try {
      const r = await apiSend<{ removidos: number }>("/api/avisos", "DELETE");
      toast({ descricao: `${r.removidos} aviso(s) removido(s).`, variante: "sucesso" });
      setTentativa((t) => t + 1);
      router.refresh();
    } catch (e) {
      toastErro(mensagem(e));
    }
  }

  if (erro) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-md border tom-alerta p-3 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0" />
        <span className="flex-1">{erro}</span>
        <Button size="sm" variant="outline" onClick={() => setTentativa((t) => t + 1)}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (!dados) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Carregando…</p>;
  }

  return (
    <div className={cn("space-y-5", carregando && "opacity-60")}>
      {/* ─── O estado do relógio ───
          Vem antes dos avisos de propósito: quando falta um aviso esperado, a
          resposta está aqui, e não na lista vazia embaixo. */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="font-display text-base">Tarefas agendadas</CardTitle>
          <p className="text-xs text-muted-foreground">
            O relógio só roda com <code className="font-mono">AGENDADOR_LIGADO=1</code>{" "}
            no <code>.env</code>. Sem isso, esta lista fica vazia e nada é
            gerado.
          </p>
        </CardHeader>
        <CardContent>
          {dados.tarefas.length === 0 ? (
            <p className="py-2 text-sm text-muted-foreground">
              Nenhuma tarefa rodou ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-1.5 pr-3 font-medium text-muted-foreground">Tarefa</th>
                    <th className="py-1.5 pr-3 font-medium text-muted-foreground">Última</th>
                    <th className="py-1.5 pr-3 font-medium text-muted-foreground">Resultado</th>
                    <th className="py-1.5 font-medium text-muted-foreground">Detalhe</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.tarefas.map((t) => (
                    <tr key={t.nome} className="border-b last:border-0">
                      <td className="py-1.5 pr-3 font-mono text-xs">{t.nome}</td>
                      <td className="py-1.5 pr-3 font-mono text-xs tabular-nums text-muted-foreground">
                        {t.ultimaExecucao ? quando(t.ultimaExecucao) : "—"}
                        {t.duracaoMs != null && (
                          <span className="ml-1.5">{(t.duracaoMs / 1000).toFixed(1)}s</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3">
                        <span
                          className={cn(
                            "rounded px-1.5 py-0.5 text-xs",
                            t.ultimoResultado === "erro" ? "tom-alerta border" : "text-muted-foreground",
                          )}
                        >
                          {t.ultimoResultado ?? "—"}
                        </span>
                      </td>
                      <td className="py-1.5 text-xs text-muted-foreground">
                        {t.ultimoDetalhe ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="eyebrow">
          {dados.pendentes > 0
            ? `${dados.pendentes} por ler · ${dados.avisos.length} no total`
            : `${dados.avisos.length} aviso(s)`}
        </h2>
        <div className="flex gap-2">
          {dados.pendentes > 0 && (
            <Button size="sm" variant="outline" onClick={marcarTudo}>
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" />
              Marcar tudo como lido
            </Button>
          )}
          {dados.avisos.some((a) => a.lidoEm) && (
            <Button size="sm" variant="ghost" onClick={limparLidos}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Limpar lidos
            </Button>
          )}
        </div>
      </div>

      {dados.avisos.length === 0 ? (
        <p className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          Nada por aqui. Os avisos aparecem sozinhos quando as tarefas rodam.
        </p>
      ) : (
        <div className="space-y-2">
          {dados.avisos.map((a) => (
            <div
              key={a.id}
              className={cn(
                "rounded-md border border-l-[3px] bg-card p-3",
                TOM[a.nivel] ?? TOM.info,
                a.lidoEm && "opacity-60",
              )}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{a.titulo}</span>
                <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  {quando(a.criadoEm)}
                </span>
              </div>
              {/* whitespace-pre-line: o corpo é montado com quebras de linha
                  para caber num WhatsApp, e a mesma quebra serve à tela. */}
              <p className="mt-1.5 whitespace-pre-line text-sm text-muted-foreground">
                {a.corpo}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                <span className="eyebrow">{a.tipo}</span>
                {a.link && (
                  <Link href={a.link} className="underline underline-offset-2">
                    ver na tela
                  </Link>
                )}
                {a.entrega && (
                  <span
                    className={cn(
                      "font-mono",
                      a.entrega === "ok" ? "text-muted-foreground" : "num-alerta",
                    )}
                  >
                    whatsapp: {a.entrega}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

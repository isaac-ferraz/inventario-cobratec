"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  Check,
  Inbox,
  MessageCircle,
  Paperclip,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShieldAlert,
  Smartphone,
  User,
  UserCheck,
} from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useConfirmar } from "@/components/ui/confirmar-dialog";
import {
  formatarTelefone,
  ROTULO_SITUACAO,
  type Papel,
  type Situacao,
} from "@/lib/conversas";
import { cn } from "@/lib/utils";

// Console de atendimento: fila à esquerda, conversa no meio, dossiê à direita.
//
// A forma vem do trabalho real: a operadora precisa ver a fila sem sair da
// conversa (para saber quantos esperam) e o dossiê sem sair da conversa (para
// não responder de memória). Três colunas no desktop; no celular, uma coluna de
// cada vez — a conversa aberta esconde a fila.

type ResumoMensagem = { autor: string; corpo: string; criadoEm: string };

type ConversaLista = {
  id: string;
  telefone: string;
  nome: string | null;
  carteira: string | null;
  situacao: Situacao;
  motivoEscalonamento: string | null;
  siscobraDevcod: number | null;
  identificadaEm: string | null;
  ultimaMensagemEm: string;
  responsavel: { id: string; nome: string; login: string } | null;
  ultimaMensagem: ResumoMensagem | null;
};

type Mensagem = {
  id: string;
  autor: string;
  corpo: string;
  criadoEm: string;
  midiaTipo?: string | null;
  midiaMime?: string | null;
  midiaArquivo?: string | null;
  usuario: { id: string; nome: string } | null;
};

type ConversaDetalhe = ConversaLista & {
  siscobraCarcod: number | null;
  dossie: Record<string, unknown> | null;
  dossieEm: string | null;
  encerradaEm: string | null;
  mensagens: Mensagem[];
};

type Resposta = {
  conversas: ConversaLista[];
  totais: Partial<Record<Situacao, number>>;
};

// A fila se atualiza de duas formas, e as duas existem de propósito:
//
//   1. o canal ao vivo (SSE) avisa no instante em que o devedor escreve;
//   2. uma consulta periódica, mais lenta, como rede de segurança — se o canal
//      cair (proxy, suspensão do notebook, app reiniciado), o pior caso volta a
//      ser "a fila demora um pouco", nunca "a fila congelou e ninguém viu".
//
// Com o canal vivo a consulta afrouxa para 60s; sem ele, volta aos 15s.
const INTERVALO_MS = 15_000;
const INTERVALO_AO_VIVO_MS = 60_000;

export function ConsoleConversas({
  usuarioId,
  papel,
}: {
  usuarioId: string;
  papel: Papel;
}) {
  const { toast, toastErro } = useToast();
  const confirmar = useConfirmar();

  const [dados, setDados] = React.useState<Resposta | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [filtro, setFiltro] = React.useState<Situacao | "todas">("todas");
  const [busca, setBusca] = React.useState("");
  const [abertaId, setAbertaId] = React.useState<string | null>(null);
  const [aberta, setAberta] = React.useState<ConversaDetalhe | null>(null);
  const [rascunho, setRascunho] = React.useState("");
  const [enviando, setEnviando] = React.useState(false);
  const [aoVivo, setAoVivo] = React.useState(false);

  // Qual conversa está aberta, para o canal ao vivo consultar sem virar
  // dependência dele (ver o efeito do EventSource).
  const abertaIdRef = React.useRef<string | null>(null);
  React.useEffect(() => {
    abertaIdRef.current = abertaId;
  }, [abertaId]);

  const carregar = React.useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filtro !== "todas") params.set("situacao", filtro);
      if (busca.trim()) params.set("busca", busca.trim());
      const r = await apiGet<Resposta>(`/api/chat/conversas?${params}`);
      setDados(r);
      setErro(null);
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setCarregando(false);
    }
  }, [filtro, busca]);

  const carregarConversa = React.useCallback(
    async (id: string) => {
      try {
        setAberta(await apiGet<ConversaDetalhe>(`/api/chat/conversas/${id}`));
      } catch (e) {
        toastErro(mensagem(e));
      }
    },
    [toastErro],
  );

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  // Recarrega fila e conversa aberta em intervalo. Limpar o timer no unmount
  // não é detalhe: sem isso, sair da tela deixaria a aba consultando para sempre.
  React.useEffect(() => {
    const t = setInterval(
      () => {
        void carregar();
        if (abertaId) void carregarConversa(abertaId);
      },
      aoVivo ? INTERVALO_AO_VIVO_MS : INTERVALO_MS,
    );
    return () => clearInterval(t);
  }, [carregar, carregarConversa, abertaId, aoVivo]);

  // O canal ao vivo. O EventSource reconecta sozinho quando a rede volta — o
  // que precisa de cuidado é o fechamento: sem o `close` no unmount, cada visita
  // à tela deixaria uma conexão pendurada no servidor.
  React.useEffect(() => {
    const canal = new EventSource("/api/chat/eventos");

    canal.onopen = () => setAoVivo(true);
    canal.onerror = () => setAoVivo(false);
    canal.onmessage = () => {
      void carregar();
      if (abertaIdRef.current) void carregarConversa(abertaIdRef.current);
    };

    return () => {
      canal.close();
      setAoVivo(false);
    };
    // Sem `abertaId` nas dependências de propósito: trocar de conversa não pode
    // derrubar e reabrir o canal. Qual conversa está aberta é lido do ref.
  }, [carregar, carregarConversa]);

  React.useEffect(() => {
    if (abertaId) void carregarConversa(abertaId);
    else setAberta(null);
  }, [abertaId, carregarConversa]);

  async function mudarSituacao(id: string, situacao: Situacao) {
    if (situacao === "encerrada") {
      const ok = await confirmar({
        titulo: "Encerrar o atendimento?",
        descricao:
          "A conversa sai da fila. Se o devedor escrever de novo, ela reabre sozinha com o robô.",
        confirmar: "Encerrar",
        destrutivo: false,
      });
      if (!ok) return;
    }
    try {
      await apiSend(`/api/chat/conversas/${id}`, "PATCH", { situacao });
      await Promise.all([carregar(), carregarConversa(id)]);
    } catch (e) {
      toastErro(mensagem(e));
    }
  }

  async function enviar() {
    if (!aberta || !rascunho.trim() || enviando) return;
    setEnviando(true);
    try {
      await apiSend(`/api/chat/conversas/${aberta.id}/mensagens`, "POST", {
        corpo: rascunho.trim(),
      });
      setRascunho("");
      await Promise.all([carregarConversa(aberta.id), carregar()]);
    } catch (e) {
      // O erro aqui é sempre importante: a API só responde ok quando o WhatsApp
      // aceitou entregar, então falha significa que o devedor NÃO recebeu.
      toast({
        titulo: "A mensagem não foi enviada",
        descricao: mensagem(e),
        variante: "erro",
        duracao: 0,
      });
    } finally {
      setEnviando(false);
    }
  }

  const totais = dados?.totais ?? {};
  const conversas = dados?.conversas ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">cobrança</div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <MessageCircle className="h-6 w-6 text-primary" /> Conversas
          </h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            Atendimento por WhatsApp aos devedores, com o dossiê da carteira ao
            lado da conversa.
            {/* Estado do canal ao vivo. Quem atende precisa saber se a fila
                aparece sozinha ou se vai depender da consulta periódica — sem
                isso, "está quieto" e "parou de atualizar" viram a mesma coisa. */}
            <span
              className="inline-flex items-center gap-1.5 text-xs"
              title={
                aoVivo
                  ? "Conversas novas aparecem na hora."
                  : "Sem canal ao vivo: a fila se atualiza a cada 15 segundos."
              }
            >
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  aoVivo ? "bg-emerald-500" : "bg-muted-foreground/40",
                )}
              />
              {aoVivo ? "ao vivo" : "atualizando a cada 15s"}
            </span>
          </p>
        </div>
        <div className="flex gap-2">
          {/* Só o TI liga e desliga a linha; a operadora usa. */}
          {papel === "ADMIN" && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/chat/conexao">
                <Smartphone className="h-4 w-4" /> Conexão
              </Link>
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => void carregar()}>
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Kpi
          rotulo="Esperando atendente"
          valor={totais.fila ?? 0}
          alerta={(totais.fila ?? 0) > 0}
          ativo={filtro === "fila"}
          onClick={() => setFiltro(filtro === "fila" ? "todas" : "fila")}
        />
        <Kpi
          rotulo="Com o robô"
          valor={totais.bot ?? 0}
          ativo={filtro === "bot"}
          onClick={() => setFiltro(filtro === "bot" ? "todas" : "bot")}
        />
        <Kpi
          rotulo="Em atendimento"
          valor={totais.humana ?? 0}
          ativo={filtro === "humana"}
          onClick={() => setFiltro(filtro === "humana" ? "todas" : "humana")}
        />
        <Kpi
          rotulo="Encerradas"
          valor={totais.encerrada ?? 0}
          ativo={filtro === "encerrada"}
          onClick={() =>
            setFiltro(filtro === "encerrada" ? "todas" : "encerrada")
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(260px,320px)_1fr_minmax(240px,300px)]">
        {/* ── fila ── */}
        <Card className={cn(aberta && "hidden lg:block")}>
          <CardContent className="space-y-3 p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Nome, telefone ou carteira"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            {carregando ? (
              <ListaVazia icone={RefreshCw} texto="Carregando a fila…" />
            ) : erro ? (
              <div className="space-y-3 py-6 text-center">
                <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
                <p className="text-sm text-muted-foreground">{erro}</p>
                <Button size="sm" variant="outline" onClick={() => void carregar()}>
                  Tentar novamente
                </Button>
              </div>
            ) : conversas.length === 0 ? (
              <ListaVazia
                icone={Inbox}
                texto={
                  busca.trim()
                    ? "Nenhuma conversa com esse termo."
                    : "Nenhuma conversa por aqui. Quando um devedor escrever, ela aparece sozinha."
                }
              />
            ) : (
              <ul className="-mx-1 space-y-1">
                {conversas.map((c) => (
                  <li key={c.id}>
                    <button
                      onClick={() => setAbertaId(c.id)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                        abertaId === c.id
                          ? "border-primary/40 bg-primary/10"
                          : "border-transparent hover:bg-muted/60",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {c.nome || formatarTelefone(c.telefone)}
                        </span>
                        <SeloSituacao situacao={c.situacao} />
                      </div>
                      {c.ultimaMensagem && (
                        <p className="mt-0.5 truncate text-xs text-muted-foreground">
                          {c.ultimaMensagem.autor === "devedor" ? "" : "você: "}
                          {c.ultimaMensagem.corpo}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                        {c.carteira && <span className="truncate">{c.carteira}</span>}
                        {c.responsavel && (
                          <span className="truncate">· {c.responsavel.nome}</span>
                        )}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── conversa ── */}
        {!aberta ? (
          <Card className="hidden lg:block">
            <CardContent className="flex h-full min-h-[420px] items-center justify-center">
              <div className="space-y-2 text-center">
                <MessageCircle className="mx-auto h-8 w-8 text-muted-foreground/50" />
                <p className="text-sm text-muted-foreground">
                  Escolha uma conversa na fila.
                </p>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="flex flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b p-3">
              <div className="min-w-0">
                <button
                  className="text-xs text-muted-foreground underline lg:hidden"
                  onClick={() => setAbertaId(null)}
                >
                  ← voltar para a fila
                </button>
                <div className="truncate font-medium">
                  {aberta.nome || formatarTelefone(aberta.telefone)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {formatarTelefone(aberta.telefone)}
                  {aberta.carteira ? ` · ${aberta.carteira}` : ""}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <SeloSituacao situacao={aberta.situacao} />
                <AcoesDaConversa
                  conversa={aberta}
                  usuarioId={usuarioId}
                  papel={papel}
                  onMudar={(s) => void mudarSituacao(aberta.id, s)}
                />
              </div>
            </div>

            {aberta.motivoEscalonamento && aberta.situacao !== "encerrada" && (
              <p className="border-b px-3 py-2 text-xs text-muted-foreground">
                O robô passou para atendimento humano:{" "}
                <strong>{aberta.motivoEscalonamento}</strong>
              </p>
            )}

            <Thread mensagens={aberta.mensagens} conversaId={aberta.id} />

            <div className="border-t p-3">
              {aberta.situacao === "humana" ? (
                <div className="space-y-2">
                  <Textarea
                    rows={3}
                    placeholder="Escreva a resposta ao devedor…"
                    value={rascunho}
                    onChange={(e) => setRascunho(e.target.value)}
                    onKeyDown={(e) => {
                      // Enter envia, Shift+Enter quebra linha — o que a mão já
                      // faz sozinha em qualquer aplicativo de mensagem.
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void enviar();
                      }
                    }}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-muted-foreground">
                      Enter envia · Shift+Enter quebra linha
                    </p>
                    <Button
                      size="sm"
                      onClick={() => void enviar()}
                      disabled={!rascunho.trim() || enviando}
                    >
                      <Send className="h-4 w-4" />
                      {enviando ? "Enviando…" : "Enviar"}
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-center text-xs text-muted-foreground">
                  {aberta.situacao === "encerrada"
                    ? "Atendimento encerrado. Se o devedor escrever, a conversa reabre sozinha."
                    : "Assuma a conversa para responder ao devedor."}
                </p>
              )}
            </div>
          </Card>
        )}

        {/* ── dossiê ── */}
        <div className={cn(!aberta && "hidden lg:block")}>
          <Dossie conversa={aberta} />
        </div>
      </div>
    </div>
  );
}

function Kpi({
  rotulo,
  valor,
  alerta,
  ativo,
  onClick,
}: {
  rotulo: string;
  valor: number;
  alerta?: boolean;
  ativo: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        "rounded-lg border px-3 py-2 text-left transition-colors",
        ativo ? "border-primary/40 bg-primary/10" : "bg-card hover:bg-muted/60",
      )}
    >
      <div
        className={cn(
          "font-display text-xl font-bold leading-none",
          alerta && valor > 0 && "num-alerta",
        )}
      >
        {valor}
      </div>
      <div className="mt-1 text-[11px] text-muted-foreground">{rotulo}</div>
    </button>
  );
}

const TOM_SITUACAO: Record<Situacao, string> = {
  bot: "tom-espera",
  fila: "tom-alerta",
  humana: "tom-ok",
  encerrada: "",
};

function SeloSituacao({ situacao }: { situacao: Situacao }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TOM_SITUACAO[situacao] || "text-muted-foreground",
      )}
    >
      {ROTULO_SITUACAO[situacao]}
    </span>
  );
}

function AcoesDaConversa({
  conversa,
  usuarioId,
  papel,
  onMudar,
}: {
  conversa: ConversaDetalhe;
  usuarioId: string;
  papel: Papel;
  onMudar: (s: Situacao) => void;
}) {
  const minha = conversa.responsavel?.id === usuarioId;
  const podeFalarNela = minha || papel === "ADMIN";

  if (conversa.situacao === "encerrada") return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {conversa.situacao !== "humana" && (
        <Button size="sm" onClick={() => onMudar("humana")}>
          <UserCheck className="h-4 w-4" /> Assumir
        </Button>
      )}
      {conversa.situacao === "humana" && podeFalarNela && (
        <>
          <Button size="sm" variant="outline" onClick={() => onMudar("fila")}>
            Devolver à fila
          </Button>
          <Button size="sm" variant="outline" onClick={() => onMudar("encerrada")}>
            <Check className="h-4 w-4" /> Encerrar
          </Button>
        </>
      )}
    </div>
  );
}

const ESTILO_AUTOR: Record<string, string> = {
  devedor: "bg-muted",
  bot: "bg-violet-50 dark:bg-violet-950/50",
  operadora: "bg-primary/10",
};

function Thread({
  mensagens,
  conversaId,
}: {
  mensagens: Mensagem[];
  conversaId: string;
}) {
  const fim = React.useRef<HTMLDivElement>(null);

  // Rolar para a última mensagem ao abrir e a cada nova: ler de baixo para cima
  // é o que a operadora faz, e começar no topo obrigaria a rolar sempre.
  React.useEffect(() => {
    fim.current?.scrollIntoView({ block: "end" });
  }, [mensagens.length]);

  if (mensagens.length === 0) {
    return (
      <div className="flex-1 p-6 text-center text-sm text-muted-foreground">
        Nenhuma mensagem ainda.
      </div>
    );
  }

  return (
    <div className="max-h-[46vh] min-h-[220px] flex-1 space-y-2 overflow-y-auto p-3">
      {mensagens.map((m) =>
        m.autor === "sistema" ? (
          <p
            key={m.id}
            className="py-1 text-center text-[11px] text-muted-foreground"
          >
            {m.corpo}
          </p>
        ) : (
          <div
            key={m.id}
            className={cn(
              "flex",
              m.autor === "devedor" ? "justify-start" : "justify-end",
            )}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-3 py-2",
                ESTILO_AUTOR[m.autor] ?? "bg-muted",
              )}
            >
              <div className="mb-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {m.autor === "devedor" ? (
                  <User className="h-3 w-3" />
                ) : m.autor === "bot" ? (
                  <Bot className="h-3 w-3" />
                ) : (
                  <UserCheck className="h-3 w-3" />
                )}
                {m.autor === "devedor"
                  ? "devedor"
                  : m.autor === "bot"
                    ? "robô"
                    : (m.usuario?.nome ?? "atendente")}
                <span>· {hora(m.criadoEm)}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm">{m.corpo}</p>
              <Anexo mensagem={m} conversaId={conversaId} />
            </div>
          </div>
        ),
      )}
      <div ref={fim} />
    </div>
  );
}

// O anexo do devedor dentro da bolha.
//
// A regra de ouro aqui é não sumir com nada: mensagem com mídia SEMPRE mostra o
// marcador de texto (`[áudio]`), e o player entra por cima quando o arquivo
// existe. Quando o download falhou ou o arquivo foi purgado, sobra o marcador
// mais um aviso — a operadora fica sabendo que veio algo e que não está aqui,
// em vez de achar que o devedor mandou uma mensagem vazia.
function Anexo({
  mensagem,
  conversaId,
}: {
  mensagem: Mensagem;
  conversaId: string;
}) {
  if (!mensagem.midiaTipo) return null;

  if (!mensagem.midiaArquivo) {
    return (
      <p className="mt-1 text-[11px] text-muted-foreground">
        Anexo não baixado — abra o WhatsApp para ver.
      </p>
    );
  }

  const src = `/api/chat/conversas/${conversaId}/midia/${mensagem.id}`;
  const mime = mensagem.midiaMime ?? "";

  if (mime.startsWith("audio/")) {
    return <audio className="mt-1.5 w-full max-w-[280px]" controls src={src} />;
  }

  if (mime.startsWith("image/")) {
    return (
      <a href={src} target="_blank" rel="noreferrer">
        {/* Imagem do devedor, servida por rota autenticada e sem dimensão
            conhecida: o otimizador do next/image não alcança (e não deve
            alcançar) conteúdo que exige sessão. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={`Imagem enviada pelo devedor às ${hora(mensagem.criadoEm)}`}
          className="mt-1.5 max-h-52 rounded-md object-cover"
        />
      </a>
    );
  }

  if (mime.startsWith("video/")) {
    return <video className="mt-1.5 max-h-52 rounded-md" controls src={src} />;
  }

  return (
    <a
      href={src}
      target="_blank"
      rel="noreferrer"
      className="mt-1 inline-flex items-center gap-1 text-xs underline underline-offset-4"
    >
      <Paperclip className="h-3 w-3" /> abrir anexo
    </a>
  );
}

function Dossie({ conversa }: { conversa: ConversaDetalhe | null }) {
  if (!conversa) {
    return (
      <Card>
        <CardContent className="py-6 text-center text-sm text-muted-foreground">
          O dossiê do devedor aparece aqui.
        </CardContent>
      </Card>
    );
  }

  const identificado = !!conversa.siscobraDevcod && !!conversa.identificadaEm;

  return (
    <Card>
      <CardContent className="space-y-3 p-3">
        <div className="eyebrow">dossiê</div>

        {/* O aviso mais importante da tela: enquanto não houver conferência de
            CPF e nascimento, nenhum valor pode ser dito ao interlocutor — ele
            pode não ser o devedor. */}
        <div
          className={cn(
            "flex items-start gap-2 rounded-lg border p-2.5 text-xs",
            identificado ? "tom-ok" : "tom-alerta",
          )}
        >
          {identificado ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          )}
          <span>
            {identificado
              ? "Identidade confirmada (CPF e nascimento). Pode tratar de valores."
              : "Ainda NÃO identificado. Não informe saldo, desconto nem proposta antes de confirmar CPF e data de nascimento."}
          </span>
        </div>

        {conversa.dossie ? (
          <dl className="space-y-1.5 text-sm">
            {Object.entries(conversa.dossie).map(([chave, valor]) => (
              <div key={chave} className="flex justify-between gap-2">
                <dt className="text-xs text-muted-foreground">{rotulo(chave)}</dt>
                <dd className="truncate text-right font-medium">
                  {formatarValor(valor)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="text-xs text-muted-foreground">
            Sem dossiê ainda. Ele chega do Siscobra quando o devedor é
            identificado.
          </p>
        )}

        {conversa.dossieEm && (
          <p className="text-[11px] text-muted-foreground">
            Consultado em {new Date(conversa.dossieEm).toLocaleString("pt-BR")}
          </p>
        )}

        {conversa.siscobraDevcod && (
          <p className="text-[11px] text-muted-foreground">
            Siscobra: devedor {conversa.siscobraDevcod}
            {conversa.siscobraCarcod ? ` · carteira ${conversa.siscobraCarcod}` : ""}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ListaVazia({
  icone: Icone,
  texto,
}: {
  icone: React.ComponentType<{ className?: string }>;
  texto: string;
}) {
  return (
    <div className="space-y-2 py-8 text-center">
      <Icone className="mx-auto h-6 w-6 text-muted-foreground/50" />
      <p className="px-4 text-xs text-muted-foreground">{texto}</p>
    </div>
  );
}

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// O dossiê vem do n8n com as chaves que a consulta do Siscobra produziu. Em vez
// de travar um formato aqui (o que obrigaria a mexer nesta tela a cada campo
// novo), a tela renderiza o que vier e só embeleza os nomes que já conhece.
const ROTULOS: Record<string, string> = {
  saldo: "Saldo devedor",
  saldoDevedor: "Saldo devedor",
  carteira: "Carteira",
  vencidoDesde: "Vencido desde",
  contratos: "Contratos",
  maxParcelas: "Máx. parcelas",
  valorMinimoParcela: "Parcela mínima",
  descontoMaximoPercentual: "Desconto máximo",
};

function rotulo(chave: string): string {
  return ROTULOS[chave] ?? chave;
}

function formatarValor(v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") {
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 2 });
  }
  if (typeof v === "boolean") return v ? "Sim" : "Não";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

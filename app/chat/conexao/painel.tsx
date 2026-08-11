"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Power,
  QrCode,
  RefreshCw,
  Smartphone,
  Unplug,
} from "lucide-react";
import { apiGet, apiSend, mensagem } from "@/lib/fetcher";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useConfirmar } from "@/components/ui/confirmar-dialog";
import { formatarTelefone } from "@/lib/conversas";

// Tela de pareamento: mostra o QR, o estado da sessão e os três botões.
//
// A forma vem do que a pessoa faz aqui: ela chega porque o WhatsApp parou de
// funcionar ou porque está ligando pela primeira vez. Então a tela responde a
// uma pergunta só, em letra grande — "está conectado?" — e só depois oferece o
// que fazer a respeito.

type Sessao = {
  status: string;
  numero: string | null;
  nome: string | null;
  webhookOk: boolean;
};

type Estado = {
  modo: "direto" | "n8n" | "desligado";
  pendencias: string[];
  sessao: Sessao | null;
  webhookUrl: string | null;
  erro: string | null;
};

// Enquanto espera o QR ser lido, o estado muda sozinho do outro lado (o celular
// bipa e a sessão vira WORKING). Sem esta consulta a pessoa ficaria olhando um
// QR já usado sem saber que deu certo.
const INTERVALO_MS = 4_000;
// O QR do WhatsApp expira em cerca de 20s e o WAHA gera outro. Puxar a imagem
// de novo antes disso evita o clássico "li o código e não aconteceu nada".
const INTERVALO_QR_MS = 15_000;

export function PainelConexao() {
  const { toast, toastErro } = useToast();
  const confirmar = useConfirmar();

  const [estado, setEstado] = React.useState<Estado | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [ocupado, setOcupado] = React.useState(false);
  // Muda para forçar o navegador a buscar o QR de novo (a rota manda no-store,
  // mas a URL igual não dispararia um request novo).
  const [selo, setSelo] = React.useState(0);

  const carregar = React.useCallback(async () => {
    try {
      setEstado(await apiGet<Estado>("/api/chat/conexao"));
      setErro(null);
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  React.useEffect(() => {
    void carregar();
  }, [carregar]);

  const status = estado?.sessao?.status ?? null;
  const esperandoQr = status === "SCAN_QR_CODE";
  // Só fica consultando enquanto algo está em movimento. Conectado e parado são
  // estados estáveis: consultar em loop só gastaria bateria do notebook do TI.
  const emMovimento = esperandoQr || status === "STARTING";

  React.useEffect(() => {
    if (!emMovimento) return;
    const t = setInterval(() => void carregar(), INTERVALO_MS);
    return () => clearInterval(t);
  }, [emMovimento, carregar]);

  React.useEffect(() => {
    if (!esperandoQr) return;
    const t = setInterval(() => setSelo((n) => n + 1), INTERVALO_QR_MS);
    return () => clearInterval(t);
  }, [esperandoQr]);

  async function agir(acao: "conectar" | "parar" | "desconectar") {
    if (acao === "desconectar") {
      const ok = await confirmar({
        titulo: "Desvincular o celular?",
        descricao:
          "A sessão perde o pareamento e o próximo acesso vai pedir um QR novo. As conversas já gravadas continuam aqui.",
        confirmar: "Desvincular",
        destrutivo: true,
      });
      if (!ok) return;
    }
    setOcupado(true);
    try {
      await apiSend("/api/chat/conexao", "POST", { acao });
      if (acao === "conectar") {
        toast({
          titulo: "Sessão iniciada",
          descricao: "Se aparecer um QR, leia com o celular do atendimento.",
        });
      }
      setSelo((n) => n + 1);
      await carregar();
    } catch (e) {
      toastErro(mensagem(e));
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="eyebrow">cobrança</div>
          <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
            <Smartphone className="h-6 w-6 text-primary" /> Conexão do WhatsApp
          </h1>
          <p className="text-sm text-muted-foreground">
            O número que recebe e responde as conversas do{" "}
            <Link href="/chat" className="underline underline-offset-4">
              atendimento
            </Link>
            .
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/chat">
              <ArrowLeft className="h-4 w-4" /> Conversas
            </Link>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelo((n) => n + 1);
              void carregar();
            }}
          >
            <RefreshCw className="h-4 w-4" /> Atualizar
          </Button>
        </div>
      </div>

      {carregando ? (
        <Card>
          <CardContent className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Consultando o gateway…
          </CardContent>
        </Card>
      ) : erro ? (
        <Card>
          <CardContent className="space-y-3 py-10 text-center">
            <AlertTriangle className="mx-auto h-6 w-6 text-amber-500" />
            <p className="text-sm text-muted-foreground">{erro}</p>
            <Button size="sm" variant="outline" onClick={() => void carregar()}>
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : estado?.modo === "n8n" ? (
        <Aviso
          titulo="Esta tela não vale aqui"
          corpo="O envio está apontado para o n8n (CHAT_ENVIO_URL), que é o caminho de produção: é o fluxo dele que conhece o gateway e faz o pareamento. Esta tela só opera o modo direto, usado para testes."
        />
      ) : estado?.modo === "desligado" ? (
        <ComoLigar pendencias={estado.pendencias} />
      ) : (
        <>
          <Card>
            <CardContent className="space-y-4 py-5">
              <Situacao sessao={estado?.sessao ?? null} erro={estado?.erro ?? null} />

              {esperandoQr && (
                <div className="space-y-3 rounded-lg border bg-muted/30 p-4 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element --
                      imagem viva do gateway, sem dimensão conhecida e trocada a
                      cada 15s: otimização do next/image não se aplica. */}
                  <img
                    src={`/api/chat/conexao/qr?t=${selo}`}
                    alt="QR code para parear o WhatsApp"
                    className="mx-auto h-56 w-56 rounded-md bg-white p-2"
                  />
                  <ol className="mx-auto max-w-sm space-y-1 text-left text-sm text-muted-foreground">
                    <li>1. Abra o WhatsApp no celular do atendimento.</li>
                    <li>
                      2. Toque em <strong>Aparelhos conectados</strong> →{" "}
                      <strong>Conectar um aparelho</strong>.
                    </li>
                    <li>3. Aponte a câmera para o código acima.</li>
                  </ol>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <Button
                  onClick={() => void agir("conectar")}
                  disabled={ocupado || status === "WORKING"}
                >
                  {ocupado ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <QrCode className="h-4 w-4" />
                  )}
                  {status === "WORKING" ? "Conectado" : "Conectar"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void agir("parar")}
                  disabled={ocupado || !estado?.sessao || status === "STOPPED"}
                >
                  <Power className="h-4 w-4" /> Parar
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void agir("desconectar")}
                  disabled={ocupado || !estado?.sessao}
                >
                  <Unplug className="h-4 w-4" /> Desvincular celular
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-2 py-4 text-sm">
              <p className="font-medium">Por onde as mensagens chegam</p>
              <p className="break-all text-xs text-muted-foreground">
                {estado?.webhookUrl}
              </p>
              <p className="text-xs text-muted-foreground">
                {estado?.sessao?.webhookOk ? (
                  <span className="tom-ok rounded px-1.5 py-0.5">
                    O gateway está avisando este endereço.
                  </span>
                ) : (
                  <span className="tom-alerta rounded px-1.5 py-0.5">
                    A sessão ainda não aponta para cá — clique em Conectar para
                    ajustar.
                  </span>
                )}{" "}
                Se o gateway roda em Docker, ele precisa enxergar este endereço
                (veja <code>WAHA_WEBHOOK_URL</code> no .env).
              </p>
            </CardContent>
          </Card>

          <p className="text-xs text-muted-foreground">
            Modo de teste: o número é pareado como &quot;aparelho conectado&quot;,
            sem API oficial. Use um chip dedicado — a automação contraria os
            termos do WhatsApp e a linha pode ser banida. Sem robô do outro lado,
            toda mensagem que chega cai direto na fila da operadora.
          </p>
        </>
      )}
    </div>
  );
}

function Situacao({
  sessao,
  erro,
}: {
  sessao: Sessao | null;
  erro: string | null;
}) {
  if (erro) {
    return (
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div>
          <p className="font-medium">Gateway fora de alcance</p>
          <p className="text-sm text-muted-foreground">{erro}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Suba com <code>docker compose -f docker-compose.waha.yml up -d</code>
            .
          </p>
        </div>
      </div>
    );
  }

  if (!sessao) {
    return (
      <div className="flex items-start gap-3">
        <QrCode className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
        <div>
          <p className="font-medium">Nenhum número pareado</p>
          <p className="text-sm text-muted-foreground">
            Clique em Conectar para gerar o QR code.
          </p>
        </div>
      </div>
    );
  }

  const mapa: Record<
    string,
    { rotulo: string; variante: "success" | "warning" | "secondary" | "destructive"; texto: string }
  > = {
    WORKING: {
      rotulo: "Conectado",
      variante: "success",
      texto: "Recebendo e enviando mensagens.",
    },
    SCAN_QR_CODE: {
      rotulo: "Esperando o QR",
      variante: "warning",
      texto: "Leia o código com o celular do atendimento.",
    },
    STARTING: {
      rotulo: "Iniciando",
      variante: "warning",
      texto: "O gateway está subindo a sessão…",
    },
    STOPPED: {
      rotulo: "Parada",
      variante: "secondary",
      texto: "A sessão está desligada. O pareamento continua salvo.",
    },
    FAILED: {
      rotulo: "Com falha",
      variante: "destructive",
      // O motivo quase sempre é este, e dizê-lo evita a caça a um problema que
      // não existe: o QR fica válido por poucos minutos e a sessão desiste.
      texto:
        "A sessão caiu — em geral porque o QR expirou sem ser lido. Conectar gera outro.",
    },
  };
  const info = mapa[sessao.status] ?? {
    rotulo: sessao.status,
    variante: "secondary" as const,
    texto: "Estado informado pelo gateway.",
  };

  return (
    <div className="flex items-start gap-3">
      {sessao.status === "WORKING" ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
      ) : (
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
      )}
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={info.variante}>{info.rotulo}</Badge>
          {sessao.numero && (
            <span className="text-sm font-medium">
              {formatarTelefone(sessao.numero)}
            </span>
          )}
          {sessao.nome && (
            <span className="text-sm text-muted-foreground">{sessao.nome}</span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{info.texto}</p>
      </div>
    </div>
  );
}

function Aviso({ titulo, corpo }: { titulo: string; corpo: string }) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-5">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div>
          <p className="font-medium">{titulo}</p>
          <p className="text-sm text-muted-foreground">{corpo}</p>
        </div>
      </CardContent>
    </Card>
  );
}

function ComoLigar({ pendencias }: { pendencias: string[] }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-5 text-sm">
        <p className="font-medium">O modo direto não está ligado</p>
        <p className="text-muted-foreground">
          Falta configurar: <strong>{pendencias.join(", ")}</strong>. Os dois
          passos, na máquina onde o sistema roda:
        </p>
        <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs">
          {`# 1. no .env
WAHA_API_KEY="$(openssl rand -base64 32)"
CHAT_SERVICE_TOKEN="$(openssl rand -base64 32)"
WAHA_URL="http://127.0.0.1:3001"

# 2. suba o gateway
docker compose -f docker-compose.waha.yml up -d`}
        </pre>
        <p className="text-xs text-muted-foreground">
          Depois reinicie o sistema para ele reler o .env e volte a esta tela.
          Passo a passo completo em <code>docs/conversas/README.md</code>.
        </p>
      </CardContent>
    </Card>
  );
}

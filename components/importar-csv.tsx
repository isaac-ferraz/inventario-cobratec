"use client";

// Botão + diálogo de importação de CSV, um só para as sete telas.
//
// O fluxo tem DUAS ETAPAS de propósito: primeiro a prévia (o servidor diz o que
// seria criado, atualizado e o que está errado, linha por linha), e só depois a
// gravação. Importação é a operação com maior chance de estragar dados em
// silêncio; ver o plano antes é o que separa "carguei a planilha" de "carguei a
// planilha errada em cima do inventário".

import * as React from "react";
import {
  AlertTriangle,
  Check,
  Download,
  FileUp,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import { apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Acao = "criar" | "atualizar" | "erro";

type LinhaPlano = { linha: number; chave: string; acao: Acao; erro?: string };

type Resultado = {
  rotulo: string;
  modo: string;
  delimitador: string;
  colunasIgnoradas: string[];
  totais: { linhas: number; criar: number; atualizar: number; erros: number };
  linhas: LinhaPlano[];
  aplicado: boolean;
  senhasSorteadas?: { login: string; senha: string }[];
};

type Props = {
  entidade: string;
  /** Chamado depois de importar, para a tela recarregar a lista. */
  onPronto: () => void;
};

const LIMITE_VISIVEL = 120;

/**
 * Lê o arquivo respeitando o encoding real. Planilha salva como "CSV" no
 * Windows costuma sair em Windows-1252, e decodificar isso como UTF-8 transforma
 * "Memória" em "Mem?ria" — então tentamos UTF-8 em modo estrito e, se o arquivo
 * não for UTF-8 válido, caímos para 1252.
 */
async function lerArquivo(arquivo: File): Promise<string> {
  const bytes = await arquivo.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function ImportarCsv({ entidade, onPronto }: Props) {
  const { toast, toastErro } = useToast();
  const [aberto, setAberto] = React.useState(false);
  const [csv, setCsv] = React.useState("");
  const [nomeArquivo, setNomeArquivo] = React.useState<string | null>(null);
  const [modo, setModo] = React.useState<"criar" | "atualizar">("criar");
  const [ignorarErros, setIgnorarErros] = React.useState(false);
  const [previa, setPrevia] = React.useState<Resultado | null>(null);
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const inputArquivo = React.useRef<HTMLInputElement>(null);

  function limpar() {
    setCsv("");
    setNomeArquivo(null);
    setPrevia(null);
    setErro(null);
    setIgnorarErros(false);
    setModo("criar");
    if (inputArquivo.current) inputArquivo.current.value = "";
  }

  function abrir() {
    limpar();
    setAberto(true);
  }

  async function escolherArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setErro(null);
    setPrevia(null);
    try {
      setCsv(await lerArquivo(arquivo));
      setNomeArquivo(arquivo.name);
    } catch {
      setErro("Não consegui ler esse arquivo.");
    }
  }

  async function chamar(aplicar: boolean) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await apiSend<Resultado>("/api/importar", "POST", {
        entidade,
        csv,
        modo,
        aplicar,
        ignorarErros,
      });
      setPrevia(r);
      if (aplicar) {
        const { criar, atualizar } = r.totais;
        toast({
          descricao: `${criar} criado(s) e ${atualizar} atualizado(s) em ${r.rotulo}.`,
          variante: "sucesso",
        });
        onPronto();
        // Senha sorteada aparece uma única vez: o diálogo fica aberto para o TI
        // copiar antes de fechar.
        if (!r.senhasSorteadas?.length) setAberto(false);
      }
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setOcupado(false);
    }
  }

  const aplicado = previa?.aplicado === true;
  const podeAplicar =
    previa !== null &&
    !aplicado &&
    previa.totais.criar + previa.totais.atualizar > 0 &&
    (previa.totais.erros === 0 || ignorarErros);

  return (
    <>
      <Button variant="outline" onClick={abrir}>
        <Upload /> Importar CSV
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar CSV</DialogTitle>
            <DialogDescription>
              Escolha a planilha, veja a prévia e só então grave. Célula em branco
              não altera o valor que já está no sistema.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={inputArquivo}
                type="file"
                accept=".csv,.txt,text/csv"
                onChange={escolherArquivo}
                className="hidden"
                id={`arquivo-${entidade}`}
              />
              <Button
                variant="secondary"
                onClick={() => inputArquivo.current?.click()}
              >
                <FileUp /> Escolher arquivo
              </Button>
              <Button variant="ghost" asChild>
                <a href={`/api/importar?entidade=${entidade}`} download>
                  <Download /> Baixar modelo
                </a>
              </Button>
              {nomeArquivo && (
                <Badge variant="secondary" className="font-mono">
                  {nomeArquivo}
                </Badge>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`csv-${entidade}`}>
                Conteúdo (pode colar direto da planilha)
              </Label>
              <Textarea
                id={`csv-${entidade}`}
                value={csv}
                onChange={(e) => {
                  setCsv(e.target.value);
                  setPrevia(null);
                }}
                rows={6}
                className="font-mono text-xs"
                // Genérico de propósito: um exemplo concreto aqui seria de UMA
                // entidade e apareceria errado nas outras seis. Quem quer o
                // formato exato baixa o modelo, que sai com o cabeçalho certo.
                placeholder={
                  "Cole o conteúdo do .csv — a primeira linha é o cabeçalho.\nUse “Baixar modelo” para ver as colunas desta tela."
                }
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">
                O que fazer com quem já está cadastrado
              </legend>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name={`modo-${entidade}`}
                  checked={modo === "criar"}
                  onChange={() => {
                    setModo("criar");
                    setPrevia(null);
                  }}
                  className="mt-1"
                />
                <span>
                  <strong>Só criar novos</strong>
                  <span className="block text-muted-foreground">
                    Linha que já existe vira erro e nada é sobrescrito.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  name={`modo-${entidade}`}
                  checked={modo === "atualizar"}
                  onChange={() => {
                    setModo("atualizar");
                    setPrevia(null);
                  }}
                  className="mt-1"
                />
                <span>
                  <strong>Criar e atualizar</strong>
                  <span className="block text-muted-foreground">
                    Quem já existe é atualizado com o que a planilha traz.
                  </span>
                </span>
              </label>
            </fieldset>

            {erro && (
              <p className="text-sm text-destructive" role="alert">
                {erro}
              </p>
            )}

            {previa && (
              <div className="space-y-3 rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant="secondary">
                    {previa.totais.linhas} linha(s)
                  </Badge>
                  <Badge className="tom-ok">{previa.totais.criar} a criar</Badge>
                  <Badge variant="secondary">
                    {previa.totais.atualizar} a atualizar
                  </Badge>
                  {previa.totais.erros > 0 && (
                    <Badge className="tom-alerta">
                      {previa.totais.erros} com erro
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground">
                    separador &quot;{previa.delimitador === "\t" ? "tab" : previa.delimitador}&quot;
                  </span>
                </div>

                {previa.colunasIgnoradas.length > 0 && (
                  <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Coluna(s) que o sistema não conhece e vai ignorar:{" "}
                    {previa.colunasIgnoradas.join(", ")}
                  </p>
                )}

                <ul className="max-h-56 space-y-1 overflow-y-auto text-xs">
                  {previa.linhas.slice(0, LIMITE_VISIVEL).map((l) => (
                    <li key={l.linha} className="flex items-start gap-2">
                      <span className="w-10 shrink-0 text-right font-mono text-muted-foreground">
                        {l.linha}
                      </span>
                      {l.acao === "erro" ? (
                        <X className="mt-0.5 h-3.5 w-3.5 shrink-0 num-alerta" />
                      ) : (
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 num-ok" />
                      )}
                      <span className="min-w-0">
                        <span className="font-medium">{l.chave}</span>
                        {l.acao === "atualizar" && (
                          <span className="text-muted-foreground"> · atualizar</span>
                        )}
                        {l.erro && (
                          <span className="block num-alerta">{l.erro}</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {previa.linhas.length > LIMITE_VISIVEL && (
                  <p className="text-xs text-muted-foreground">
                    Mostrando as {LIMITE_VISIVEL} primeiras de{" "}
                    {previa.linhas.length}.
                  </p>
                )}

                {previa.totais.erros > 0 && !aplicado && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={ignorarErros}
                      onChange={(e) => setIgnorarErros(e.target.checked)}
                    />
                    Importar só as linhas válidas e ignorar as{" "}
                    {previa.totais.erros} com erro
                  </label>
                )}

                {previa.senhasSorteadas && previa.senhasSorteadas.length > 0 && (
                  <div className="space-y-1 rounded-md border p-2">
                    <p className="text-sm font-medium">
                      Senhas provisórias sorteadas
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Aparecem só agora. Entregue a cada pessoa; o sistema cobra a
                      troca no primeiro acesso.
                    </p>
                    <ul className="font-mono text-xs">
                      {previa.senhasSorteadas.map((s) => (
                        <li key={s.login}>
                          {s.login}: {s.senha}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAberto(false)}>
              {aplicado ? "Fechar" : "Cancelar"}
            </Button>
            {!aplicado && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => chamar(false)}
                  disabled={ocupado || csv.trim() === ""}
                >
                  {ocupado && <Loader2 className="animate-spin" />}
                  Ver prévia
                </Button>
                <Button
                  onClick={() => chamar(true)}
                  disabled={ocupado || !podeAplicar}
                >
                  {ocupado && <Loader2 className="animate-spin" />}
                  Importar
                  {previa
                    ? ` ${previa.totais.criar + previa.totais.atualizar} linha(s)`
                    : ""}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

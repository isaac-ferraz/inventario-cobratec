"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// As peças de desenho do relatório. Nenhuma sabe o que é um acordo: recebem
// pontos e uma série, e devolvem forma.
//
// ─────────────────────── três regras que valem em todas ───────────────────────
//
// 1. UM EIXO POR GRÁFICO. Acordos e acionamentos nunca dividem o mesmo plano,
//    por mais que caibam: duas escalas no mesmo desenho inventam uma correlação
//    que o dado não tem — 90 acordos e 3.000 acionamentos alinhados no mesmo
//    topo sugerem empate. São dois gráficos, cada um com a sua escala.
//
// 2. A COR É DA ENTIDADE, NÃO DA POSIÇÃO. Acordo é teal em todo lugar,
//    acionamento é violeta em todo lugar. Se a cor seguisse o ranking, filtrar
//    uma equipe repintaria as barras e quem aprendeu "teal = acordo" leria
//    errado no segundo olhar.
//
// 3. O VALOR NUNCA MORA SÓ NO HOVER. Toda barra é alcançável pelo teclado e
//    todo gráfico tem gêmeo em tabela na visão "detalhado" — quem usa leitor de
//    tela, quem imprime e quem não distingue as duas cores leem os mesmos
//    números.

export type Ponto = {
  chave: number | null;
  rotulo: string;
  qtd: number;
  valor: number;
};

export type Serie = "acordo" | "acionamento" | "aVencer" | "atraso";

const COR: Record<Serie, string> = {
  acordo: "var(--serie-acordo)",
  acionamento: "var(--serie-acionamento)",
  aVencer: "var(--serie-avencer)",
  atraso: "var(--serie-atraso)",
};

/** Rótulo do que a segunda métrica significa em cada série. */
export type Formato = (p: Ponto) => string;

/**
 * Quais colunas levam rótulo escrito no eixo.
 *
 * A PRIMEIRA sempre leva, e é o detalhe que importa: numa agenda que começa
 * hoje, esconder a primeira coluna esconde exatamente o dia que a pessoa abriu
 * a tela para ver.
 */
function mostraRotulo(
  p: Ponto,
  i: number,
  total: number,
  eixo: "hora" | "dia",
): boolean {
  // Em hora o passo é pela HORA e não pelo índice: assim o eixo mostra sempre
  // as pares (10, 12, 14…), a cadência que se lê sem pensar — pelo índice, um
  // expediente que começa às 9h mostraria as ímpares.
  if (eixo === "hora") return total <= 12 || (p.chave ?? 0) % 2 === 0;
  // "14/08" ocupa cinco caracteres; dez deles já enchem a largura de um card.
  const passo = Math.max(1, Math.ceil(total / 10));
  return i % passo === 0;
}

function Dica({ children }: { children: React.ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden -translate-x-1/2 whitespace-nowrap rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block group-focus-visible:block"
    >
      {children}
    </span>
  );
}

/**
 * Colunas por faixa de tempo — uma por hora do expediente, ou uma por dia da
 * agenda de vencimento.
 *
 * Coluna e não linha: cada faixa é um balde fechado ("o que entrou entre 9h e
 * 10h", "o que vence dia 14"), e linha entre baldes desenha uma transição
 * contínua que não existe.
 *
 * A faixa VAZIA continua na tela, com um traço rente à base. É informação de
 * primeira nos dois usos: some as 12h e as barras das 11h e das 13h ficam
 * coladas, contando que o time trabalhou sem parar no horário em que ninguém
 * atendeu; some o domingo e a agenda esconde o fim de semana, que é justamente
 * o vão que faz a cobrança de sexta valer por três dias.
 *
 * `denso` só muda o eixo escrito: com muitas colunas, rótulo em todas vira
 * mancha. Em hora dá para pular as ímpares (dois dígitos, cadência conhecida);
 * em dia o rótulo tem cinco caracteres, e aí o passo é calculado para caberem
 * no máximo dez.
 */
export function ColunasPorFaixa({
  dados,
  serie,
  formato,
  vazio = "Sem movimento no período.",
  eixo = "hora",
}: {
  dados: Ponto[];
  serie: Serie;
  formato: Formato;
  vazio?: string;
  eixo?: "hora" | "dia";
}) {
  if (dados.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">{vazio}</p>;
  }
  const max = Math.max(1, ...dados.map((d) => d.qtd));
  // Só o pico ganha número fixo na tela. Um valor sobre cada coluna vira ruído
  // e ninguém lê; o resto sai no hover, no foco e na tabela.
  const pico = dados.reduce((a, b) => (b.qtd > a.qtd ? b : a));

  return (
    <div>
      <div className="flex h-44 items-end gap-1">
        {dados.map((d) => {
          const altura = (d.qtd / max) * 100;
          const ehPico = d.chave === pico.chave && d.qtd > 0;
          return (
            <button
              key={d.chave ?? d.rotulo}
              type="button"
              // O alvo do ponteiro é a coluna INTEIRA, da base ao topo do
              // gráfico — não só o pedaço pintado. Mirar numa barra de 3px de
              // altura é a diferença entre um gráfico e um teste de pontaria.
              className="group relative flex h-full flex-1 cursor-default flex-col justify-end rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={`${d.rotulo}: ${d.qtd} — ${formato(d)}`}
            >
              <Dica>
                <strong className="font-medium">{d.rotulo}</strong> · {d.qtd} ·{" "}
                {formato(d)}
              </Dica>
              {ehPico && (
                <span className="mb-0.5 text-center font-mono text-[10px] leading-none text-muted-foreground">
                  {d.qtd}
                </span>
              )}
              <span
                aria-hidden
                className={cn(
                  "w-full rounded-t-[4px] transition-opacity group-hover:opacity-80",
                  d.qtd === 0 && "opacity-25",
                )}
                style={{
                  // Piso de 2px: a hora sem nada precisa existir como traço,
                  // senão o eixo mente por omissão.
                  height: d.qtd === 0 ? "2px" : `max(3px, ${altura}%)`,
                  background: COR[serie],
                }}
              />
            </button>
          );
        })}
      </div>
      {/* O eixo mora FORA da caixa de altura fixa: dentro dela, o rótulo das
          faixas seria cortado e o card ganharia uma barra de rolagem interna. */}
      <div className="mt-1.5 flex gap-1 border-t pt-1.5">
        {dados.map((d, i) => (
          <span
            key={d.chave ?? d.rotulo}
            className="flex-1 text-center font-mono text-[10px] tabular-nums text-muted-foreground"
          >
            {mostraRotulo(d, i, dados.length, eixo) ? d.rotulo.replace("h", "") : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Ranking horizontal — operadoras, carteiras, situações.
 *
 * Barra horizontal porque o rótulo é um nome de pessoa: na vertical ele viraria
 * texto girado ou abreviado, e o gráfico existe justamente para ser lido nome a
 * nome.
 */
export function BarrasRanking({
  dados,
  serie,
  formato,
  limite = 10,
  vazio = "Sem dados no período.",
}: {
  dados: Ponto[];
  serie: Serie;
  formato: Formato;
  limite?: number;
  vazio?: string;
}) {
  if (dados.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{vazio}</p>;
  }
  const mostrados = dados.slice(0, limite);
  const max = Math.max(1, ...mostrados.map((d) => d.qtd));

  return (
    <div className="space-y-2.5">
      {mostrados.map((d) => (
        <div
          key={`${d.chave ?? ""}-${d.rotulo}`}
          tabIndex={0}
          className="group relative rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`${d.rotulo}: ${d.qtd} — ${formato(d)}`}
        >
          <Dica>{formato(d)}</Dica>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate text-foreground">{d.rotulo}</span>
            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              {d.qtd}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.qtd / max) * 100}%`, background: COR[serie] }}
            />
          </div>
        </div>
      ))}
      {dados.length > limite && (
        <p className="eyebrow pt-1">
          + {dados.length - limite} fora do top {limite} · veja em “detalhado”
        </p>
      )}
    </div>
  );
}

/**
 * O número grande.
 *
 * Sem `tabular-nums` de propósito: dígito de largura fixa deixa "97" com um
 * buraco no meio em corpo grande. Alinhamento vertical de algarismo é problema
 * de tabela, e lá ele está ligado.
 */
export function Numero({
  rotulo,
  valor,
  detalhe,
  serie,
}: {
  rotulo: string;
  valor: string;
  detalhe?: React.ReactNode;
  serie?: Serie;
}) {
  return (
    <div className="relative overflow-hidden rounded-md border bg-card p-4">
      {serie && (
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5"
          style={{ background: COR[serie] }}
        />
      )}
      <div className="text-xs text-muted-foreground">{rotulo}</div>
      <div className="mt-1.5 font-display text-3xl font-bold leading-none">
        {valor}
      </div>
      {detalhe && <div className="eyebrow mt-1.5">{detalhe}</div>}
    </div>
  );
}

/** O gêmeo em tabela de qualquer um dos gráficos acima. */
export function TabelaFatias({
  dados,
  coluna,
  segunda,
  formato,
}: {
  dados: Ponto[];
  coluna: string;
  segunda: string;
  formato: Formato;
}) {
  if (dados.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">Sem dados no período.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-1.5 pr-3 font-medium text-muted-foreground">{coluna}</th>
            <th className="py-1.5 pr-3 text-right font-medium text-muted-foreground">
              Qtd.
            </th>
            <th className="py-1.5 text-right font-medium text-muted-foreground">
              {segunda}
            </th>
          </tr>
        </thead>
        <tbody>
          {dados.map((d) => (
            <tr key={`${d.chave ?? ""}-${d.rotulo}`} className="border-b last:border-0">
              <td className="py-1.5 pr-3">{d.rotulo}</td>
              <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{d.qtd}</td>
              <td className="py-1.5 text-right font-mono tabular-nums">{formato(d)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

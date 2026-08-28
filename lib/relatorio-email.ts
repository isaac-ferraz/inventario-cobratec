// O corpo do e-mail do relatório diário — montado por código, nunca pelo modelo.
//
// ─────────────────── isto é a decisão 32 aplicada de novo ───────────────────
//
// A decisão 32 resolveu o robô de cobrança assim: o modelo classifica, o código
// responde. Nenhum número, nome ou data que chega ao devedor passa pelo modelo,
// porque a garantia de não inventar tem de ser propriedade da estrutura e não
// promessa sobre comportamento.
//
// Quem dispara o relatório diário é um agente — um modelo. Se ele escrevesse o
// e-mail, escreveria os números; e um número datilografado a partir de um JSON
// que ele leu há três passos é um número que pode sair diferente do anexo. O
// e-mail que vai ao cliente sairia dizendo uma coisa e a planilha, outra.
//
// Então o texto sai daqui, inteiro, pronto para ser encaminhado. O agente
// entrega o envelope; ele não escreve a carta.
//
// ─────────────────────────── e as ressalvas vão junto ───────────────────────────
//
// As três frases de método no fim do texto não são rodapé: "em atraso" não
// significa "não pagou" (decisão 36), o honorário ainda não bate com o relatório
// oficial do Siscobra, e acionamento conta só ação manual. A planilha já as
// carrega na aba Parâmetros — mas quem lê um e-mail muitas vezes não abre o
// anexo, e é aí que o número perde o nome certo.
import { formatarDiaBr } from "@/lib/relatorios";

export type ResumoDiario = {
  carteiras: { cod: number; nome: string; ativa: boolean }[];
  dia: string;
  hoje: string;
  janela: { inicio: string; fim: string; dias: number };
  vazio: boolean;
  avisos: string[];
  dia_numeros: {
    acordos: { qtd: number; valor: number };
    acionamentos: { qtd: number; devedores: number };
    honorarios: {
      qtd: number;
      valor: number;
      recebido: number;
      conferida: boolean;
    } | null;
  };
  mes: { inicio: string; fim: string; acordos: { qtd: number; valor: number } };
  base: {
    fichas: number;
    contratos: number;
    saldo: number;
    cadastrados: number;
  } | null;
  carteira_acordos: {
    aVencer: { qtd: number; valor: number };
    venceHoje: { qtd: number; valor: number };
    atraso: { qtd: number; valor: number; desde: string | null };
    quebras: { qtd: number; valor: number };
    primeiraParcela: { avaliados: number; pagos: number };
  };
};

export type Email = { assunto: string; texto: string; html: string };

export function dinheiro(v: number): string {
  return (
    v
      .toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      // O `Intl` separa "R$" do número com espaço NÃO-SEPARÁVEL (U+00A0). Ele é
      // invisível e idêntico na tela — e é por isso que atrapalha: quem procurar
      // "R$ 3.461,46" no e-mail, com espaço comum, não acha; colar num sistema
      // que espera espaço comum também falha. O texto sai igual, e agora
      // pesquisável.
      .replace(/\u00a0/g, " ")
  );
}

export function inteiro(v: number): string {
  return v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** "REDE DROGAL" ou "REDE DROGAL e mais 2 carteiras". */
export function tituloCarteiras(cs: { nome: string }[]): string {
  if (cs.length === 0) return "carteira";
  if (cs.length === 1) return cs[0].nome;
  return `${cs[0].nome} e mais ${cs.length - 1} carteira${cs.length > 2 ? "s" : ""}`;
}

type Linha = { rotulo: string; valor: string };
type Secao = { titulo: string; linhas: Linha[] };

function secoes(r: ResumoDiario): Secao[] {
  const ca = r.carteira_acordos;
  const lista: Secao[] = [
    {
      titulo: `Movimento do dia — ${formatarDiaBr(r.dia)}`,
      linhas: [
        { rotulo: "Acordos fechados", valor: inteiro(r.dia_numeros.acordos.qtd) },
        { rotulo: "Valor acordado", valor: dinheiro(r.dia_numeros.acordos.valor) },
        {
          rotulo: "Acionamentos (ações manuais)",
          valor: `${inteiro(r.dia_numeros.acionamentos.qtd)} em ${inteiro(
            r.dia_numeros.acionamentos.devedores,
          )} devedores distintos`,
        },
        ...(r.dia_numeros.honorarios
          ? [
              {
                rotulo: "Honorários apurados",
                valor: dinheiro(r.dia_numeros.honorarios.valor),
              },
            ]
          : []),
      ],
    },
    {
      titulo: `Acumulado do mês — ${formatarDiaBr(r.mes.inicio)} a ${formatarDiaBr(r.mes.fim)}`,
      linhas: [
        { rotulo: "Acordos fechados", valor: inteiro(r.mes.acordos.qtd) },
        { rotulo: "Valor acordado", valor: dinheiro(r.mes.acordos.valor) },
      ],
    },
  ];

  if (r.base) {
    lista.push({
      titulo: `Base da carteira — posição de ${formatarDiaBr(r.hoje)}`,
      linhas: [
        { rotulo: "Fichas com saldo em aberto", valor: inteiro(r.base.fichas) },
        { rotulo: "Contratos em aberto", valor: inteiro(r.base.contratos) },
        { rotulo: "Saldo a cobrar", valor: dinheiro(r.base.saldo) },
        {
          rotulo: "Devedores cadastrados (com ou sem saldo)",
          valor: inteiro(r.base.cadastrados),
        },
      ],
    });
  }

  lista.push({
    titulo: "Carteira de acordos",
    linhas: [
      {
        rotulo: `A vencer (${formatarDiaBr(r.janela.inicio)} a ${formatarDiaBr(r.janela.fim)})`,
        valor: `${inteiro(ca.aVencer.qtd)} parcelas · ${dinheiro(ca.aVencer.valor)}`,
      },
      { rotulo: "Vence hoje", valor: dinheiro(ca.venceHoje.valor) },
      {
        rotulo: "Em atraso",
        valor: `${inteiro(ca.atraso.qtd)} parcelas · ${dinheiro(ca.atraso.valor)}`,
      },
      {
        rotulo: "Acordos quebrados (últimos 30 dias)",
        valor: `${inteiro(ca.quebras.qtd)} · ${dinheiro(ca.quebras.valor)}`,
      },
      {
        rotulo: "1ª parcela honrada",
        valor: `${inteiro(ca.primeiraParcela.pagos)} de ${inteiro(
          ca.primeiraParcela.avaliados,
        )} acordos avaliados`,
      },
    ],
  });

  return lista;
}

/**
 * As ressalvas de método. A do honorário só aparece quando há aba de honorário —
 * ressalva sobre número que não está no e-mail é ruído, e ruído ensina a pular
 * as outras.
 */
function ressalvas(r: ResumoDiario): string[] {
  const notas = [
    "“Em atraso” quer dizer que a parcela venceu e não encontramos a baixa " +
      "correspondente — não é o mesmo que afirmar que o devedor não pagou.",
    "“Acionamentos” conta apenas ação manual da operadora; o retorno automático " +
      "do discador fica de fora. Acordo conta o acordo ativo, pelo valor total " +
      "negociado com juros e multa.",
  ];
  if (r.dia_numeros.honorarios && !r.dia_numeros.honorarios.conferida) {
    notas.push(
      "Os honorários ainda não foram conferidos contra o relatório oficial de " +
        "comissão do Siscobra, ao contrário de acordos e acionamentos, que foram.",
    );
  }
  return notas;
}

/**
 * A frase do dia sem movimento.
 *
 * Ela existe porque zero calado se lê como defeito. O que ela NÃO faz é
 * explicar o motivo ("a carteira é nova", "foi feriado") — isso o programa não
 * sabe, e um motivo inventado é pior que nenhum.
 */
function fraseDoVazio(r: ResumoDiario): string {
  return (
    `Em ${formatarDiaBr(r.dia)} não houve movimento registrado nesta carteira: ` +
    "nenhum acordo fechado, nenhum acionamento manual e nenhum honorário apurado. " +
    "Os números abaixo estão zerados por isso, e não por falha na apuração — a " +
    "posição da carteira segue na seção seguinte."
  );
}

export function montarEmail(r: ResumoDiario): Email {
  const nome = tituloCarteiras(r.carteiras);
  const assunto = `${nome} — relatório diário de ${formatarDiaBr(r.dia)}`;
  const blocos = secoes(r);
  const notas = ressalvas(r);

  // ─── texto puro ───
  const linhasTexto: string[] = [
    "Prezados,",
    "",
    `Segue o relatório diário da carteira ${nome}, referente a ${formatarDiaBr(r.dia)}.`,
  ];
  if (r.vazio) linhasTexto.push("", fraseDoVazio(r));
  for (const aviso of r.avisos) linhasTexto.push("", `Atenção: ${aviso}`);
  for (const s of blocos) {
    linhasTexto.push("", s.titulo.toUpperCase());
    for (const l of s.linhas) linhasTexto.push(`  • ${l.rotulo}: ${l.valor}`);
  }
  linhasTexto.push("", "COMO ESTES NÚMEROS SÃO CONTADOS");
  for (const n of notas) linhasTexto.push(`  • ${n}`);
  linhasTexto.push(
    "",
    "A planilha em anexo traz o detalhamento, com indicadores e gráficos.",
    "",
    "Atenciosamente,",
    "Cobratec — Departamento de TI",
  );

  // ─── html ───
  //
  // Estilo em atributo `style`, sem folha e sem imagem: cliente de e-mail
  // descarta `<style>` no topo e bloqueia recurso externo. Tabela de duas
  // colunas porque é o que sobrevive em Outlook.
  const esc = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const html = [
    '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#111827;max-width:640px">',
    `<p>Prezados,</p>`,
    `<p>Segue o relatório diário da carteira <strong>${esc(nome)}</strong>, referente a <strong>${formatarDiaBr(r.dia)}</strong>.</p>`,
    r.vazio
      ? `<p style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:10px 12px;margin:16px 0">${esc(fraseDoVazio(r))}</p>`
      : "",
    ...r.avisos.map(
      (a) =>
        `<p style="background:#FEF2F2;border-left:4px solid #DC2626;padding:10px 12px;margin:16px 0">${esc(a)}</p>`,
    ),
    ...blocos.map((s) =>
      [
        `<h3 style="margin:22px 0 8px;font-size:14px;color:#1F2937;border-bottom:2px solid #E5E7EB;padding-bottom:4px">${esc(s.titulo)}</h3>`,
        '<table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse">',
        ...s.linhas.map(
          (l, i) =>
            `<tr style="background:${i % 2 ? "#F9FAFB" : "#FFFFFF"}">` +
            `<td style="padding:6px 8px;color:#4B5563">${esc(l.rotulo)}</td>` +
            `<td style="padding:6px 8px;text-align:right;font-weight:600;white-space:nowrap">${esc(l.valor)}</td>` +
            "</tr>",
        ),
        "</table>",
      ].join(""),
    ),
    '<h3 style="margin:22px 0 8px;font-size:14px;color:#1F2937">Como estes números são contados</h3>',
    '<ul style="margin:0;padding-left:18px;color:#4B5563;font-size:13px">',
    ...notas.map((n) => `<li style="margin-bottom:6px">${esc(n)}</li>`),
    "</ul>",
    '<p style="margin-top:22px">A planilha em anexo traz o detalhamento, com indicadores e gráficos.</p>',
    '<p style="color:#6B7280;font-size:13px">Atenciosamente,<br/>Cobratec — Departamento de TI</p>',
    "</div>",
  ]
    .filter(Boolean)
    .join("\n");

  return { assunto, texto: linhasTexto.join("\n"), html };
}

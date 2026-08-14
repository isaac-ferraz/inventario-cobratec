// Dashboard — indicadores principais do inventário (mesma base do Excel).
//
// Todo indicador é clicável e abre um POP-UP com os registros por trás do
// número: "Sem licença Windows: 7" responde "quais sete?" sem tirar o analista
// do painel. O caminho para a tela completa (com edição e filtros) fica num link
// pequeno no rodapé do pop-up — é a exceção, não o gesto principal.
//
// As listas são montadas aqui, no servidor: a página já carrega computadores,
// celulares e chamados para calcular os números, então o detalhe sai de graça.
import Link from "next/link";
import { AlarmClock } from "lucide-react";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { escopoDe, sessaoAtual } from "@/lib/sessao-servidor";
import {
  ehSupervisor,
  filtroCelular,
  filtroChamado,
  filtroComputador,
} from "@/lib/supervisao";
import { ROTULO_STATUS, STATUS_ABERTOS, type Status } from "@/lib/chamados";
import {
  DIAS_AVISO_GARANTIA,
  ROTULO_SITUACAO,
  type Situacao,
} from "@/lib/ativos";
import { PENDENCIAS } from "@/lib/pendencias";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ExportButton } from "@/components/export-button";
import { AlternadorRelatorio } from "@/components/relatorios/alternador";
import { BarList, CardPendencia, Kpi } from "@/components/dashboard/cards";
import {
  LIMITE_DETALHE,
  type Barra,
  type Detalhe,
  type ItemDetalhe,
} from "@/components/dashboard/tipos";

export const dynamic = "force-dynamic";

// Rótulos que não são cargo/sala de verdade — viram recortes da lista, não
// filtros por nome.
const SEM_DONO = "Sem funcionário (estoque)";
const SEM_SALA = "Sem sala definida";

type PcComRelacoes = {
  id: string;
  identificador: string;
  apelido: string | null;
  situacao: string;
  funcionario: { id: string; nome: string; cargo: string } | null;
  sala: { id: string; nome: string } | null;
};

type CelComRelacoes = {
  id: string;
  identificador: string;
  apelido: string | null;
  numero: string | null;
  situacao: string;
  funcionario: { id: string; nome: string; cargo: string } | null;
};

// Um computador vira linha do pop-up: patrimônio, quem usa e onde fica.
function itemPc(c: PcComRelacoes): ItemDetalhe {
  return {
    id: c.id,
    titulo: c.identificador,
    subtitulo:
      [c.apelido, c.funcionario?.nome, c.sala?.nome].filter(Boolean).join(" · ") ||
      null,
    etiqueta: c.funcionario?.cargo ?? "estoque",
    // Leva à própria máquina na lista, já buscada pelo patrimônio.
    href: `/computadores?busca=${encodeURIComponent(c.identificador)}`,
  };
}

function itemCel(c: CelComRelacoes): ItemDetalhe {
  return {
    id: c.id,
    titulo: c.identificador,
    subtitulo:
      [c.apelido, c.numero, c.funcionario?.nome].filter(Boolean).join(" · ") ||
      null,
    etiqueta: c.funcionario?.cargo ?? "estoque",
    href: `/celulares?busca=${encodeURIComponent(c.identificador)}`,
  };
}

/** Monta o detalhe de um indicador a partir da lista completa dele. */
function detalhe(
  todos: ItemDetalhe[],
  href: string,
  descricao?: string,
): Detalhe {
  return {
    itens: todos.slice(0, LIMITE_DETALHE),
    total: todos.length,
    href,
    descricao,
  };
}

export default async function DashboardPage() {
  // O painel do supervisor mostra o parque DELE. Sem este recorte, o número
  // grande na tela seria o da empresa inteira — e ele clicaria para abrir uma
  // lista com menos itens do que o card prometeu.
  const usuario = await sessaoAtual();
  if (!usuario) redirect("/login");
  const escopo = escopoDe(usuario);
  const soDaSala = ehSupervisor(escopo);

  const ondeComputador = filtroComputador(escopo) ?? {};
  const ondeCelular = filtroCelular(escopo) ?? {};
  const ondeChamado = filtroChamado(escopo) ?? {};

  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const CAMPOS_CHAMADO = {
    id: true,
    numero: true,
    titulo: true,
    status: true,
    prioridade: true,
    criadoEm: true,
    responsavel: { select: { nome: true } },
  } as const;

  // Os chamados agora vêm como LISTA (e não só contagem): é ela que o pop-up
  // mostra. O teto evita carregar a fila inteira de um ano no painel.
  const [abertos, semResponsavelLista, resolvidos] = await Promise.all([
    prisma.chamado.findMany({
      where: { AND: [{ status: { in: STATUS_ABERTOS } }, ondeChamado] },
      orderBy: { criadoEm: "asc" },
      select: CAMPOS_CHAMADO,
      take: 200,
    }),
    prisma.chamado.findMany({
      where: {
        AND: [
          { status: { in: STATUS_ABERTOS }, responsavelId: null },
          ondeChamado,
        ],
      },
      orderBy: { criadoEm: "asc" },
      select: CAMPOS_CHAMADO,
      take: 200,
    }),
    prisma.chamado.findMany({
      where: { AND: [{ resolvidoEm: { gte: seteDiasAtras } }, ondeChamado] },
      orderBy: { resolvidoEm: "desc" },
      select: CAMPOS_CHAMADO,
      take: 200,
    }),
  ]);

  const chamadosAbertos = abertos.length;
  const semResponsavel = semResponsavelLista.length;
  const resolvidos7d = resolvidos.length;
  const chamadoMaisAntigo = abertos[0] ?? null;

  const itemChamado = (c: (typeof abertos)[number]): ItemDetalhe => ({
    id: c.id,
    titulo: `#${c.numero} · ${c.titulo}`,
    subtitulo: c.responsavel ? `com ${c.responsavel.nome}` : "sem responsável",
    etiqueta: ROTULO_STATUS[c.status as Status] ?? c.status,
    href: `/chamados/${c.id}`,
  });

  const [computadores, celulares] = await Promise.all([
    prisma.computador.findMany({
      where: ondeComputador,
      orderBy: { identificador: "asc" },
      include: {
        funcionario: true,
        sala: true,
        componentes: { include: { tipo: true } },
      },
    }),
    prisma.celular.findMany({
      where: ondeCelular,
      orderBy: { identificador: "asc" },
      include: { funcionario: true },
    }),
  ]);

  const total = computadores.length;
  const pcsSemDono = computadores.filter((c) => !c.funcionario);
  const pcsComDono = computadores.filter((c) => c.funcionario);
  const emUso = pcsComDono.length;

  const totalCelulares = celulares.length;
  const celsSemDono = celulares.filter((c) => !c.funcionario);

  // ── Agrupamentos: guardam a lista junto com a contagem, para o pop-up ──
  const porCargo = new Map<string, PcComRelacoes[]>();
  for (const c of computadores) {
    const cargo = c.funcionario?.cargo ?? SEM_DONO;
    porCargo.set(cargo, [...(porCargo.get(cargo) ?? []), c]);
  }

  const porSala = new Map<string, PcComRelacoes[]>();
  const salaIdPorNome = new Map<string, string>();
  for (const c of computadores) {
    const sala = c.sala?.nome ?? SEM_SALA;
    if (c.sala) salaIdPorNome.set(c.sala.nome, c.sala.id);
    porSala.set(sala, [...(porSala.get(sala) ?? []), c]);
  }

  // Por tipo de componente conta PEÇAS, mas o pop-up lista MÁQUINAS — é o que
  // dá para abrir e conferir. A máquina com 2 pentes de RAM aparece uma vez.
  const porTipo = new Map<string, { pecas: number; id: string; pcs: Set<string> }>();
  const pcPorId = new Map(computadores.map((c) => [c.id, c]));
  for (const c of computadores) {
    for (const comp of c.componentes) {
      const atual = porTipo.get(comp.tipo.nome);
      const pcs = atual?.pcs ?? new Set<string>();
      pcs.add(c.id);
      porTipo.set(comp.tipo.nome, {
        pecas: (atual?.pecas ?? 0) + 1,
        id: comp.tipo.id,
        pcs,
      });
    }
  }

  const cargoData: Barra[] = [...porCargo.entries()]
    .map(([label, pcs]) => ({
      label,
      valor: pcs.length,
      detalhe: detalhe(
        pcs.map(itemPc),
        label === SEM_DONO
          ? "/computadores?funcionario=sem"
          : `/computadores?cargo=${encodeURIComponent(label)}`,
        label === SEM_DONO
          ? "Máquinas sem dono — estoque ou aguardando destino."
          : `Computadores de quem ocupa o cargo “${label}”.`,
      ),
    }))
    .sort((a, b) => b.valor - a.valor);

  const salaData: Barra[] = [...porSala.entries()]
    .map(([label, pcs]) => ({
      label,
      valor: pcs.length,
      detalhe: detalhe(
        pcs.map(itemPc),
        salaIdPorNome.has(label)
          ? `/salas/${salaIdPorNome.get(label)}`
          : "/computadores?sala=sem",
        salaIdPorNome.has(label)
          ? `Computadores registrados na sala “${label}”.`
          : "Máquinas sem sala registrada.",
      ),
    }))
    .sort((a, b) => b.valor - a.valor);

  const tipoData: Barra[] = [...porTipo.entries()]
    .map(([label, { pecas, id, pcs }]) => ({
      label,
      valor: pecas,
      detalhe: detalhe(
        [...pcs].map((pcId) => itemPc(pcPorId.get(pcId)!)),
        `/computadores?tipo=${id}`,
        `${pecas} peça(s) de “${label}” em ${pcs.size} computador(es).`,
      ),
    }))
    .sort((a, b) => b.valor - a.valor);

  // ── Ciclo de vida: o que exige uma decisão do TI nas próximas semanas ──
  const limiteGarantia = new Date(
    Date.now() + DIAS_AVISO_GARANTIA * 24 * 60 * 60 * 1000,
  );
  const agora = new Date();

  const equipamentos = [
    ...computadores.map((c) => ({ tipo: "pc" as const, e: c })),
    ...celulares.map((c) => ({ tipo: "cel" as const, e: c })),
  ];

  const itemEquip = (x: (typeof equipamentos)[number]): ItemDetalhe => {
    const base = x.tipo === "pc" ? itemPc(x.e) : itemCel(x.e);
    return {
      ...base,
      etiqueta:
        ROTULO_SITUACAO[x.e.situacao as Situacao] ?? base.etiqueta ?? null,
    };
  };

  const emManutencao = equipamentos.filter((x) => x.e.situacao === "manutencao");
  const descartados = equipamentos.filter((x) => x.e.situacao === "descartado");
  const garantiaVencendo = equipamentos.filter(
    (x) =>
      x.e.garantiaAte &&
      x.e.garantiaAte <= limiteGarantia &&
      x.e.garantiaAte >= agora &&
      x.e.situacao !== "descartado",
  );

  // ── Pendências: contagem e lista saem do MESMO catálogo que a tela filtra ──
  const pendencias = PENDENCIAS.map((p) => {
    const faltando = computadores.filter(p.falta);
    return {
      chave: p.chave,
      rotulo: p.rotulo,
      valor: faltando.length,
      detalhe: detalhe(
        faltando.map(itemPc),
        `/computadores?pendencia=${p.chave}`,
        `Computadores em que falta registrar: ${p.rotulo.toLowerCase()}.`,
      ),
    };
  });

  const kpis = [
    {
      titulo: "Total de computadores",
      valor: total,
      icone: "monitor" as const,
      detalhe: detalhe(
        computadores.map(itemPc),
        "/computadores",
        "Todo o parque de máquinas registrado.",
      ),
    },
    {
      titulo: "Computadores em uso",
      valor: emUso,
      icone: "usuarios" as const,
      detalhe: detalhe(
        pcsComDono.map(itemPc),
        "/computadores?funcionario=com",
        "Máquinas com dono definido.",
      ),
    },
    {
      titulo: "Total de celulares",
      valor: totalCelulares,
      icone: "celular" as const,
      detalhe: detalhe(
        celulares.map(itemCel),
        "/celulares",
        "Todos os aparelhos corporativos.",
      ),
    },
    {
      titulo: "Em estoque (PCs + celulares)",
      valor: pcsSemDono.length + celsSemDono.length,
      icone: "estoque" as const,
      detalhe: detalhe(
        [...pcsSemDono.map(itemPc), ...celsSemDono.map(itemCel)],
        "/computadores?funcionario=sem",
        "Equipamentos sem dono — parados no estoque.",
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">relatórios</div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Informática
          </h1>
          {/* Largura travada para o texto não empurrar o alternador e o botão
              de Excel para a linha de baixo — com a frase inteira solta, eles
              caíam desalinhados sob o título. */}
          <p className="max-w-xl text-sm text-muted-foreground">
            Clique em qualquer número para ver quais registros estão por trás
            dele.{" "}
            {soDaSala
              ? "Este painel mostra apenas as salas pelas quais você responde."
              : "O Excel reflete exatamente estes dados."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <AlternadorRelatorio />
          {/* A planilha sai com o parque inteiro; recortá-la é outro trabalho.
              Até lá, o botão é só do TI — coerente com /api/export. */}
          {!soDaSala && <ExportButton />}
        </div>
      </div>

      {/* Suporte vem primeiro: é o que pede ação hoje. */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="eyebrow">suporte</h2>
          <Link
            href="/chamados"
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            ver fila de chamados →
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Kpi
            titulo="Chamados em aberto"
            valor={chamadosAbertos}
            icone="suporte"
            tom={chamadosAbertos > 0 ? "alerta" : "ok"}
            detalhe={detalhe(
              abertos.map(itemChamado),
              "/chamados?status=abertos",
              "Do mais antigo para o mais recente.",
            )}
            rodape={
              chamadoMaisAntigo && (
                <span className="flex items-center gap-1">
                  <AlarmClock className="h-3 w-3" />
                  mais antigo: #{chamadoMaisAntigo.numero}
                </span>
              )
            }
          />
          <Kpi
            titulo="Sem responsável"
            valor={semResponsavel}
            icone="semResponsavel"
            tom={semResponsavel > 0 ? "alerta" : "ok"}
            detalhe={detalhe(
              semResponsavelLista.map(itemChamado),
              "/chamados?status=abertos&responsavel=sem",
              "Chamados em aberto que ninguém assumiu.",
            )}
            rodape={
              semResponsavel > 0 ? "esperando alguém assumir" : "fila coberta"
            }
          />
          <Kpi
            titulo="Resolvidos (7 dias)"
            valor={resolvidos7d}
            icone="resolvido"
            tom="ok"
            detalhe={detalhe(
              resolvidos.map(itemChamado),
              "/chamados?status=resolvido",
              "Resolvidos na última semana.",
            )}
            rodape="na última semana"
          />
        </div>
      </section>

      {/* Ciclo de vida: só aparece quando há algo a decidir. */}
      {(emManutencao.length > 0 ||
        garantiaVencendo.length > 0 ||
        descartados.length > 0) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="eyebrow">ciclo de vida</h2>
            <Link
              href="/manutencoes"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              ver manutenções →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Kpi
              titulo="No conserto"
              valor={emManutencao.length}
              icone="conserto"
              tom="alerta"
              detalhe={detalhe(
                emManutencao.map(itemEquip),
                "/manutencoes?situacao=abertas",
                "Equipamentos parados na assistência.",
              )}
              rodape="equipamentos parados"
            />
            <Kpi
              titulo="Garantia acabando"
              valor={garantiaVencendo.length}
              icone="garantia"
              tom="alerta"
              detalhe={detalhe(
                garantiaVencendo.map(itemEquip),
                "/computadores?garantia=vencendo",
                `Garantia termina nos próximos ${DIAS_AVISO_GARANTIA} dias — ainda dá tempo de acionar.`,
              )}
              rodape={`nos próximos ${DIAS_AVISO_GARANTIA} dias`}
            />
            <Kpi
              titulo="Descartados"
              valor={descartados.length}
              icone="descarte"
              tom="apagado"
              detalhe={detalhe(
                descartados.map(itemEquip),
                "/computadores?situacao=descartado",
                "Fora do parque, mantidos para histórico.",
              )}
              rodape="fora do parque"
            />
          </div>
        </section>
      )}

      <h2 className="eyebrow">parque de equipamentos</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((k) => (
          <Kpi
            key={k.titulo}
            titulo={k.titulo}
            valor={k.valor}
            icone={k.icone}
            detalhe={k.detalhe}
          />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">
              Computadores por cargo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList dados={cargoData} cor="bg-primary" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">
              Computadores por sala
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList dados={salaData} cor="bg-violet-500" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base">
              Componentes por tipo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <BarList dados={tipoData} cor="bg-emerald-500" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">
            Pendências de licença / conta
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendencias.map((p) => (
              <CardPendencia
                key={p.chave}
                rotulo={p.rotulo}
                valor={p.valor}
                totalPcs={total}
                detalhe={p.detalhe}
              />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

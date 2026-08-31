// O filtro múltiplo do inventário — onde uma lista mostra o que não devia.
//
// Dois casos carregam o arquivo. O primeiro é a sentinela: "sem sala" e "sala X"
// convivem na mesma seleção, e tratar a sentinela como id faria "?sala=sem"
// devolver zero linhas em silêncio. O segundo é o escopo do supervisor, que
// precisa ser TETO e não sugestão — se ele virasse união, a barra de endereços
// seria uma escalada de privilégio.
import { describe, expect, it } from "vitest";
import {
  combina,
  combinaAlgum,
  combinaValor,
  intersecaoDeEscopo,
  lerSelecao,
} from "@/lib/filtros-multi";

describe("lerSelecao", () => {
  it("vazio e o padrão significam sem filtro", () => {
    expect(lerSelecao("", "todos").todos).toBe(true);
    expect(lerSelecao("todos", "todos").todos).toBe(true);
    expect(lerSelecao("todas", "todas").todos).toBe(true);
  });

  it("lê a lista de ids", () => {
    const s = lerSelecao("a1,b2", "todos");
    expect(s.todos).toBe(false);
    expect([...s.ids]).toEqual(["a1", "b2"]);
  });

  it("separa as sentinelas dos ids", () => {
    const s = lerSelecao("sem,a1", "todos");
    expect(s.sem).toBe(true);
    expect([...s.ids]).toEqual(["a1"]);
  });

  it("“todos” no meio da lista vence", () => {
    // Quem marcou "todas as salas" junto com duas salas quis todas. Sem esta
    // regra o filtro ficaria mais restritivo do que o último clique.
    expect(lerSelecao("a1,todos,b2", "todos").todos).toBe(true);
  });

  it("tolera espaço e vírgula sobrando", () => {
    const s = lerSelecao(" a1 , , b2 ", "todos");
    expect([...s.ids]).toEqual(["a1", "b2"]);
  });
});

describe("combina — o item passa?", () => {
  const semFiltro = lerSelecao("todos", "todos");
  const soSem = lerSelecao("sem", "todos");
  const doisIds = lerSelecao("a1,b2", "todos");
  const semMaisUm = lerSelecao("sem,a1", "todos");

  it("sem filtro, tudo passa", () => {
    expect(combina(semFiltro, "a1")).toBe(true);
    expect(combina(semFiltro, null)).toBe(true);
  });

  it("“sem” traz só quem não tem", () => {
    expect(combina(soSem, null)).toBe(true);
    expect(combina(soSem, "")).toBe(true);
    expect(combina(soSem, "a1")).toBe(false);
  });

  it("id escolhido NÃO arrasta quem não tem nenhum", () => {
    // O erro clássico: `?sala=abc` devolvendo as máquinas sem sala junto,
    // porque `null` "não é diferente de abc".
    expect(combina(doisIds, "a1")).toBe(true);
    expect(combina(doisIds, "b2")).toBe(true);
    expect(combina(doisIds, "c3")).toBe(false);
    expect(combina(doisIds, null)).toBe(false);
  });

  it("sentinela e id convivem", () => {
    expect(combina(semMaisUm, null)).toBe(true);
    expect(combina(semMaisUm, "a1")).toBe(true);
    expect(combina(semMaisUm, "b2")).toBe(false);
  });

  it("“com” aceita qualquer dono, mas não os sem dono", () => {
    const comQualquer = lerSelecao("com", "todos");
    expect(combina(comQualquer, "quem-quer-que-seja")).toBe(true);
    expect(combina(comQualquer, null)).toBe(false);
  });
});

describe("combinaValor — campos sem sentinela", () => {
  it("filtra por texto exato", () => {
    const s = lerSelecao("Operadora,Gestor", "todos");
    expect(combinaValor(s, "Operadora")).toBe(true);
    expect(combinaValor(s, "Gestor")).toBe(true);
    expect(combinaValor(s, "Supervisor")).toBe(false);
  });

  it("valor ausente só passa com a sentinela", () => {
    expect(combinaValor(lerSelecao("Operadora", "todos"), null)).toBe(false);
    expect(combinaValor(lerSelecao("sem", "todos"), null)).toBe(true);
  });
});

describe("combinaAlgum — o item tem vários", () => {
  const s = lerSelecao("ssd,gpu", "todos");

  it("basta um dos escolhidos", () => {
    expect(combinaAlgum(s, ["cpu", "ssd"])).toBe(true);
    expect(combinaAlgum(s, ["gpu"])).toBe(true);
  });

  it("nenhum dos escolhidos não passa", () => {
    expect(combinaAlgum(s, ["cpu", "ram"])).toBe(false);
  });

  it("item sem nada só passa com a sentinela", () => {
    expect(combinaAlgum(s, [])).toBe(false);
    expect(combinaAlgum(lerSelecao("sem", "todos"), [])).toBe(true);
  });
});

describe("intersecaoDeEscopo — o teto do supervisor", () => {
  it("sem teto (admin), a escolha passa inteira", () => {
    expect(intersecaoDeEscopo(["s1", "s9"], null)).toEqual(["s1", "s9"]);
  });

  it("sem escolha, vale o escopo inteiro", () => {
    expect(intersecaoDeEscopo([], ["s1", "s2"])).toEqual(["s1", "s2"]);
  });

  it("recorta DENTRO do escopo, nunca fora", () => {
    expect(intersecaoDeEscopo(["s1", "s2"], ["s1", "s3"])).toEqual(["s1"]);
  });

  it("pedir só o que não é seu devolve vazio, não o escopo", () => {
    // É o caso que importa: o supervisor da sala 1 digita `?sala=s9` na barra
    // de endereços. Vazio é a resposta certa — devolver o escopo dele seria
    // ignorar o filtro, e devolver s9 seria escalada de privilégio.
    expect(intersecaoDeEscopo(["s9"], ["s1"])).toEqual([]);
  });
});

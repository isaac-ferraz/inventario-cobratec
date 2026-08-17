// O barramento que acende a fila.
//
// O que se protege aqui é o que só aparece depois de dias no ar: ouvinte que
// não é removido (cada aba fechada deixaria um para trás) e ouvinte quebrado
// que derruba a gravação da mensagem que o originou.
import { describe, expect, it, vi } from "vitest";
import { assinar, publicar, totalDeOuvintes, type EventoChat } from "@/lib/chat-eventos";

describe("avisos de conversa", () => {
  it("quem assinou recebe", () => {
    const recebidos: EventoChat[] = [];
    const cancelar = assinar((e) => recebidos.push(e));

    publicar({ tipo: "mensagem", conversaId: "c1" });
    expect(recebidos).toEqual([{ tipo: "mensagem", conversaId: "c1" }]);

    cancelar();
  });

  it("todas as telas abertas recebem o mesmo aviso", () => {
    const a = vi.fn();
    const b = vi.fn();
    const cancelarA = assinar(a);
    const cancelarB = assinar(b);

    publicar({ tipo: "mensagem", conversaId: "c1" });
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);

    cancelarA();
    cancelarB();
  });

  // O vazamento clássico de SSE: a aba fecha e o ouvinte fica.
  it("cancelar remove de verdade", () => {
    const antes = totalDeOuvintes();
    const cancelar = assinar(() => {});
    expect(totalDeOuvintes()).toBe(antes + 1);

    cancelar();
    expect(totalDeOuvintes()).toBe(antes);

    // Cancelar duas vezes (unmount + abort) não pode estourar nem remover outro.
    cancelar();
    expect(totalDeOuvintes()).toBe(antes);
  });

  // A mensagem do devedor já está gravada quando isto roda: uma aba morta no
  // meio da entrega não pode virar erro 500 para o gateway.
  it("ouvinte quebrado não derruba o publicador nem os outros", () => {
    const bom = vi.fn();
    const cancelarRuim = assinar(() => {
      throw new Error("aba fechou no meio");
    });
    const cancelarBom = assinar(bom);

    expect(() => publicar({ tipo: "mensagem" })).not.toThrow();
    expect(bom).toHaveBeenCalledTimes(1);

    cancelarRuim();
    cancelarBom();
  });
});

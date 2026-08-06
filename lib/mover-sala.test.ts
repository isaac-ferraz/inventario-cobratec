import { describe, it, expect } from "vitest";
import { filtroForaDoDestino } from "./mover-sala";

// Este filtro já quebrou uma vez: escrito só como `NOT: { salaId: destino }`,
// o SQL vira `salaId <> 'destino'`, que NÃO é verdadeiro quando salaId é NULL.
// Resultado: nada "sem sala" era encontrado — justamente o caso mais comum ao
// trazer algo para uma sala. Os testes abaixo travam o comportamento correto.
describe("filtroForaDoDestino", () => {
  it("indo para uma sala, inclui quem está sem sala", () => {
    const filtro = filtroForaDoDestino("sala-1");
    expect(filtro).toEqual({
      OR: [{ salaId: null }, { NOT: { salaId: "sala-1" } }],
    });
    // A cláusula que cobre o registro sem sala precisa existir explicitamente.
    expect(filtro.OR?.some((c) => "salaId" in c && c.salaId === null)).toBe(true);
  });

  it("indo para uma sala, exclui quem já está nela", () => {
    const filtro = filtroForaDoDestino("sala-1");
    expect(filtro.OR).toContainEqual({ NOT: { salaId: "sala-1" } });
  });

  it("indo para 'sem sala', pega só quem hoje tem sala", () => {
    expect(filtroForaDoDestino(null)).toEqual({ NOT: { salaId: null } });
  });
});

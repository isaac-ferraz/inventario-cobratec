// Fonte única das salas iniciais do escritório.
// Usada pelo seed completo (prisma/seed.ts) e pelo seed só-de-salas
// (prisma/seed-salas.cjs, rodado no boot do container).
//
// A lista é só o ponto de partida: novas salas são cadastradas pela tela
// /salas, sem mexer no código.
const SALAS_PADRAO = [
  { nome: "Sala 93 — piso superior", predio: "93", piso: "superior", ordem: 1 },
  { nome: "Sala 93 — piso inferior", predio: "93", piso: "inferior", ordem: 2 },
  { nome: "Administrativo 83", predio: "83", piso: null, ordem: 3 },
  { nome: "Judiciário 83", predio: "83", piso: null, ordem: 4 },
];

module.exports = { SALAS_PADRAO };

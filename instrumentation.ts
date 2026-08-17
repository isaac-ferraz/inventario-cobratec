// O único gancho que o Next dá para rodar código na subida do servidor.
//
// Serve para uma coisa só: ligar o relógio (`lib/agendador.ts`). Duas guardas,
// e as duas importam:
//
//   • `NEXT_RUNTIME === "nodejs"` — o hook também roda no runtime Edge, onde
//     não existe Prisma nem `setInterval` de vida longa. Sem a guarda, o import
//     do cliente Prisma quebraria o build do middleware.
//
//   • `AGENDADOR_LIGADO` — sem ela, todo `npm run dev` na máquina de alguém
//     viraria um agendador: às 18h o desenvolvedor mandaria o fechamento do dia
//     para o celular da gerência, com os dados do banco de teste dele.
//
// O import é dinâmico de propósito: estático, ele arrastaria Prisma e o pool do
// Siscobra para dentro do bundle do Edge mesmo com a guarda em volta.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.AGENDADOR_LIGADO !== "1") return;
  const { iniciarAgendador } = await import("@/lib/agendador");
  iniciarAgendador();
}

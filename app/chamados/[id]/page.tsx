import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao-servidor";
import { DetalheChamado } from "@/components/chamados/detalhe";

export default async function ChamadoPage({
  params,
}: {
  params: { id: string };
}) {
  const usuario = await sessaoAtual();
  if (!usuario) redirect("/login");

  // O papel e o id vêm da sessão no servidor. A tela usa isso só para decidir
  // o que mostrar; quem pode ver o chamado é decidido na API (que responde 404
  // para chamado de outra pessoa).
  return (
    <DetalheChamado
      chamadoId={params.id}
      papel={usuario.papel}
      usuarioId={usuario.id}
    />
  );
}

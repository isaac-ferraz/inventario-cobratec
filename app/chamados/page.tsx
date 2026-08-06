import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao-servidor";
import { ListaChamados } from "@/components/chamados/lista";

// Server Component só para descobrir o papel: a tela muda de forma (filtros de
// fila, coluna de solicitante) conforme quem está olhando. O escopo dos dados
// não depende disto — a API já entrega só o que o papel pode ver.
export default async function ChamadosPage() {
  const usuario = await sessaoAtual();
  if (!usuario) redirect("/login");

  return <ListaChamados papel={usuario.papel} />;
}

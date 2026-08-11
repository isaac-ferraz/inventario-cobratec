import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao-servidor";
import { PainelConexao } from "./painel";

// Conexão do número de WhatsApp (modo direto, decisão 29).
//
// Só ADMIN: parear a linha é trabalho do TI. A operadora de cobrança usa o
// WhatsApp o dia inteiro no /chat, mas não liga nem derruba a conexão da equipe
// — mesma divisão de /usuarios e do catálogo de tipos. O portão real é
// `exigirAdmin` em cada rota de /api/chat/conexao; aqui é a navegação.
export default async function ConexaoPage() {
  const usuario = await sessaoAtual();
  if (!usuario) redirect("/login");
  if (usuario.papel !== "ADMIN") redirect("/chat");

  return <PainelConexao />;
}

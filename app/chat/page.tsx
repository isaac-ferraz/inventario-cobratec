import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao-servidor";
import { alcancaConversas } from "@/lib/conversas";
import { ConsoleConversas } from "./console";

// Console de conversas com devedor.
//
// O portão real da API é `exigirChat` (lib/autorizacao.ts), aplicado em cada
// rota de /api/chat. Aqui é só a checagem de navegação, no mesmo espírito das
// outras telas: quem não é do ofício não vê. `alcancaConversas` é a mesma regra
// dos dois lados, para não existir a chance de a tela e a API discordarem.
export default async function ChatPage() {
  const usuario = await sessaoAtual();
  if (!usuario) redirect("/login");
  if (!alcancaConversas(usuario.papel)) redirect("/chamados");

  return <ConsoleConversas usuarioId={usuario.id} papel={usuario.papel} />;
}

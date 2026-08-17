// Avisos — o que o sistema descobriu sem ninguém pedir.
//
// É a contrapartida do relógio: sem uma tela onde eles pousem, o único registro
// de um aviso seria a mensagem de WhatsApp, e mensagem de WhatsApp some no
// meio de outras trinta. Aqui ela fica, com o resultado do envio ao lado — o
// que também é como se descobre que o gateway parou de entregar.
import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao-servidor";
import { telaInicial } from "@/lib/supervisao";
import { PainelAvisos } from "./painel";

export const dynamic = "force-dynamic";

export default async function AvisosPage() {
  const usuario = await sessaoAtual();
  if (!usuario) redirect("/login");
  // Espelha `exigirRelatorio` na API.
  if (usuario.papel !== "ADMIN" && usuario.papel !== "SUPERVISOR") {
    redirect(telaInicial(usuario.papel));
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">automação</div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Avisos</h1>
        <p className="text-sm text-muted-foreground">
          O que as tarefas agendadas encontraram, e se o aviso chegou ao
          WhatsApp.
        </p>
      </div>
      <PainelAvisos />
    </div>
  );
}

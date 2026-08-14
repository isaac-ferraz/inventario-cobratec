// Relatório de cobrança — a produção da operação, lida do Siscobra.
//
// A página é servidor só para conferir o papel e desenhar o cabeçalho; os
// números chegam pela API, do lado do cliente, porque cada troca de filtro
// consulta um banco EXTERNO. Renderizar isso no servidor a cada mudança faria a
// navegação inteira do Next esperar o CRM responder.
import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao-servidor";
import { telaInicial } from "@/lib/supervisao";
import { configSiscobra } from "@/lib/siscobra";
import { AlternadorRelatorio } from "@/components/relatorios/alternador";
import { PainelCobranca } from "./painel";

export const dynamic = "force-dynamic";

export default async function RelatorioCobrancaPage() {
  const usuario = await sessaoAtual();
  if (!usuario) redirect("/login");
  // Espelha `exigirRelatorio` (lib/autorizacao.ts) e o middleware. O portão de
  // verdade está na API — esta checagem existe para a pessoa não ver uma tela
  // vazia com erro 403 dentro.
  if (usuario.papel !== "ADMIN" && usuario.papel !== "SUPERVISOR") {
    redirect(telaInicial(usuario.papel));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">relatórios</div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Cobrança
          </h1>
          <p className="text-sm text-muted-foreground">
            Acordos e acionamentos da operação, direto do Siscobra.
          </p>
        </div>
        <AlternadorRelatorio />
      </div>

      {configSiscobra() ? (
        <PainelCobranca />
      ) : (
        <div className="rounded-md border tom-alerta p-4 text-sm">
          <p className="font-medium">Conexão com o Siscobra não configurada.</p>
          <p className="mt-1">
            Defina <code className="font-mono">DB_HOST</code>,{" "}
            <code className="font-mono">DB_USER</code>,{" "}
            <code className="font-mono">DB_PASSWORD</code> e{" "}
            <code className="font-mono">DB_NAME</code> no <code>.env</code> e
            recrie o container. O usuário do banco precisa apenas de{" "}
            <code className="font-mono">GRANT SELECT</code>.
          </p>
        </div>
      )}
    </div>
  );
}

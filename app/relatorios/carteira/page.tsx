// Carteira de acordos — o que vence e o que atrasou, lido do Siscobra.
//
// A outra metade do relatório de cobrança: aquele responde "o que fechou", este
// responde "o que vem". São telas separadas e não abas do mesmo painel porque
// os filtros são de naturezas opostas — lá o período olha para trás, aqui a
// janela olha para frente, e um seletor só serviria mal aos dois.
//
// Servidor apenas para conferir o papel e desenhar o cabeçalho; os números
// chegam pela API, do lado do cliente, porque cada troca de filtro consulta um
// banco EXTERNO (mesmo motivo do painel de cobrança).
import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/sessao-servidor";
import { telaInicial } from "@/lib/supervisao";
import { configSiscobra } from "@/lib/siscobra";
import { AlternadorRelatorio } from "@/components/relatorios/alternador";
import { PainelCarteira } from "./painel";

export const dynamic = "force-dynamic";

export default async function RelatorioCarteiraPage() {
  const usuario = await sessaoAtual();
  if (!usuario) redirect("/login");
  // Espelha `exigirCarteira` (lib/autorizacao.ts) e PERMITIDO_COBRANCA no
  // middleware. O portão de verdade está na API — esta checagem existe para a
  // pessoa não ver uma tela vazia com 403 dentro.
  const { papel } = usuario;
  if (papel !== "ADMIN" && papel !== "SUPERVISOR" && papel !== "COBRANCA") {
    redirect(telaInicial(papel));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="eyebrow">relatórios</div>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Carteira de acordos
          </h1>
          <p className="text-sm text-muted-foreground">
            O que vence nos próximos dias e o que venceu sem entrar.
          </p>
        </div>
        <AlternadorRelatorio papel={papel} />
      </div>

      {configSiscobra() ? (
        <PainelCarteira papel={papel} />
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

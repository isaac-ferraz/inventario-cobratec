import { LifeBuoy } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

// MARCADOR — a Fase 3 substitui esta página pelo helpdesk de verdade
// (abrir chamado, acompanhar, responder). Ela existe agora porque o operador
// já consegue entrar no sistema e é para cá que ele é mandado: sem isto,
// o login dele terminaria num 404.
export default function ChamadosPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="eyebrow">suporte</div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
          <LifeBuoy className="h-6 w-6 text-primary" /> Chamados
        </h1>
      </div>
      <Card>
        <CardContent className="space-y-2 py-8 text-center">
          <p className="font-medium">Abertura de chamados em construção.</p>
          <p className="text-sm text-muted-foreground">
            Enquanto isso, fale com o TI pelos canais de sempre. Seu acesso já
            está ativo — quando o módulo entrar no ar, seus chamados aparecem
            aqui.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

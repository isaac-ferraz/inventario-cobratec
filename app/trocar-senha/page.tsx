"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { KeyRound, Loader2 } from "lucide-react";
import { apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  // `inicial=1` chega de quem entrou com senha provisória.
  const inicial = params.get("inicial") === "1";

  const [senhaAtual, setSenhaAtual] = React.useState("");
  const [novaSenha, setNovaSenha] = React.useState("");
  const [confirmacao, setConfirmacao] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [ok, setOk] = React.useState(false);

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    // Confirmação é checada aqui porque é erro de digitação, não regra de
    // negócio — não vale uma ida ao servidor.
    if (novaSenha !== confirmacao) {
      setErro("A confirmação não confere com a nova senha.");
      return;
    }
    setSalvando(true);
    setErro(null);
    try {
      await apiSend("/api/senha", "POST", { senhaAtual, novaSenha });
      setOk(true);
      setSenhaAtual("");
      setNovaSenha("");
      setConfirmacao("");
      router.refresh();
    } catch (e) {
      setErro(mensagem(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={salvar} className="space-y-4">
      {inicial && !ok && (
        <p className="tom-alerta rounded-md border p-3 text-sm">
          Sua senha foi definida por outra pessoa. Escolha uma senha própria
          antes de continuar.
        </p>
      )}
      <div className="space-y-1.5">
        <Label htmlFor="atual">Senha atual</Label>
        <Input
          id="atual"
          type="password"
          value={senhaAtual}
          onChange={(e) => setSenhaAtual(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="nova">Nova senha</Label>
        <Input
          id="nova"
          type="password"
          value={novaSenha}
          onChange={(e) => setNovaSenha(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />
        <p className="text-xs text-muted-foreground">Mínimo de 8 caracteres.</p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirma">Repita a nova senha</Label>
        <Input
          id="confirma"
          type="password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
          autoComplete="new-password"
          required
        />
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      {ok && (
        <p role="status" className="text-sm text-emerald-600">
          Senha alterada. Ela já vale para o próximo acesso.
        </p>
      )}
      <Button type="submit" disabled={salvando}>
        {salvando && <Loader2 className="animate-spin" />}
        Salvar nova senha
      </Button>
    </form>
  );
}

export default function TrocarSenhaPage() {
  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <div className="eyebrow">conta</div>
        <h1 className="flex items-center gap-2 font-display text-2xl font-bold tracking-tight">
          <KeyRound className="h-6 w-6 text-primary" /> Trocar senha
        </h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base">
            Senha de acesso ao sistema
          </CardTitle>
        </CardHeader>
        <CardContent>
          <React.Suspense
            fallback={
              <div className="flex justify-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <Formulario />
          </React.Suspense>
        </CardContent>
      </Card>
    </div>
  );
}

"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { apiSend, mensagem } from "@/lib/fetcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";

function Formulario() {
  const router = useRouter();
  const params = useSearchParams();
  const [login, setLogin] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [entrando, setEntrando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setEntrando(true);
    setErro(null);
    try {
      const r = await apiSend<{
        usuario: { papel: string; senhaProvisoria: boolean };
      }>("/api/sessao", "POST", { login, senha });

      // Senha definida por outra pessoa: manda trocar antes de usar o sistema.
      if (r.usuario?.senhaProvisoria) {
        router.replace("/trocar-senha?inicial=1");
      } else {
        const de = params.get("de");
        const destino =
          de && de.startsWith("/") && !de.startsWith("//")
            ? de
            : r.usuario?.papel === "ADMIN"
              ? "/"
              : "/chamados";
        router.replace(destino);
      }
      router.refresh();
    } catch (e) {
      setErro(mensagem(e));
      setEntrando(false);
    }
  }

  return (
    <form onSubmit={entrar} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="login">Login</Label>
        <Input
          id="login"
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          autoComplete="username"
          autoFocus
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="senha">Senha</Label>
        <Input
          id="senha"
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          autoComplete="current-password"
          required
        />
      </div>
      {erro && (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={entrando}>
        {entrando ? <Loader2 className="animate-spin" /> : <LogIn />}
        Entrar
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Logo className="h-12" />
          <div className="eyebrow">inventário de hardware</div>
        </div>

        <Card>
          <CardContent className="pt-6">
            {/* useSearchParams exige Suspense no App Router. */}
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

        <p className="text-center text-xs text-muted-foreground">
          Acesso restrito ao pessoal autorizado. Perdeu a senha? Peça a
          redefinição ao administrador do sistema.
        </p>
      </div>
    </main>
  );
}

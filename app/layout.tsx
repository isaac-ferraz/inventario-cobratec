import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Sidebar, TopBar } from "@/components/shell/nav";
import { ToastProvider } from "@/components/ui/toast";
import { ConfirmarProvider } from "@/components/ui/confirmar-dialog";
import { TemaProvider, SCRIPT_ANTI_FLASH } from "@/components/ui/tema";
import { sessaoAtual } from "@/lib/sessao-servidor";
import { pendentes } from "@/lib/avisos";
import { COOKIE_SESSAO } from "@/lib/sessao";
import { cn } from "@/lib/utils";
import "./globals.css";

// Fontes self-hosted (next/font): funcionam offline na LAN, sem CDN externo.
const display = Space_Grotesk({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
});
const sans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
});
const mono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Inventário de Hardware — Cobratec TI",
  description: "Controle de hardware dos computadores do escritório.",
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // A sessão é lida aqui para: decidir se há shell (a tela de login não tem
  // navegação), filtrar o menu pelo papel e — principalmente — REVOGAR acesso.
  //
  // Revogação: o middleware só valida a assinatura do cookie (roda no Edge, sem
  // banco). Se o usuário foi inativado ou removido depois de entrar, o cookie
  // dele continua criptograficamente válido. É aqui, com banco à mão, que isso
  // é pego — sem esta checagem, um acesso cortado sobreviveria até o cookie
  // expirar. As APIs têm a mesma checagem via exigirSessao.
  const temCookie = !!cookies().get(COOKIE_SESSAO)?.value;
  const usuario = await sessaoAtual();
  if (!usuario && temCookie) {
    // Cookie zumbi: manda encerrar (lá o cookie é apagado de verdade) para não
    // ficar rodando entre /login e as páginas.
    redirect("/api/sessao/encerrar");
  }

  // O contador de avisos por ler. Um COUNT no SQLite por navegação, e só para
  // quem alcança a tela — o operador e a cobrança nunca veem o item, então
  // contar para eles seria uma consulta por página para descartar o resultado.
  const avisos =
    usuario && (usuario.papel === "ADMIN" || usuario.papel === "SUPERVISOR")
      ? await pendentes()
      : 0;

  const corpo = usuario ? (
    <div className="md:flex">
      <Sidebar papel={usuario.papel} usuario={usuario.nome} avisos={avisos} />
      <div className="flex min-h-screen flex-1 flex-col">
        <TopBar papel={usuario.papel} usuario={usuario.nome} avisos={avisos} />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8">
          {children}
        </main>
      </div>
    </div>
  ) : (
    // Sem sessão: só o conteúdo (tela de login).
    children
  );

  return (
    // suppressHydrationWarning: o script abaixo põe a classe `dark` no <html>
    // antes do React montar, então o HTML do cliente diverge do servidor de
    // propósito — é o preço de não piscar branco.
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_ANTI_FLASH }} />
      </head>
      <body
        className={cn(
          display.variable,
          sans.variable,
          mono.variable,
          "font-sans",
        )}
      >
        <TemaProvider>
          <ToastProvider>
            <ConfirmarProvider>{corpo}</ConfirmarProvider>
          </ToastProvider>
        </TemaProvider>
      </body>
    </html>
  );
}

import type { Metadata } from "next";
import { Space_Grotesk, IBM_Plex_Sans, IBM_Plex_Mono } from "next/font/google";
import { Sidebar, TopBar } from "@/components/shell/nav";
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

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body
        className={cn(
          display.variable,
          sans.variable,
          mono.variable,
          "font-sans",
        )}
      >
        <div className="md:flex">
          <Sidebar />
          <div className="flex min-h-screen flex-1 flex-col">
            <TopBar />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 md:px-8">
              {children}
            </main>
          </div>
        </div>
      </body>
    </html>
  );
}

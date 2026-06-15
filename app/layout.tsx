import type { Metadata } from "next";
import Link from "next/link";
import { Cpu } from "lucide-react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Inventário de Hardware — Cobratec TI",
  description: "Controle de hardware dos computadores do escritório.",
};

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/computadores", label: "Computadores" },
  { href: "/funcionarios", label: "Funcionários" },
  { href: "/tipos", label: "Tipos de componente" },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <div className="min-h-screen bg-muted/30">
          <header className="border-b bg-background">
            <div className="container flex h-14 items-center gap-6">
              <Link href="/" className="flex items-center gap-2 font-semibold">
                <Cpu className="h-5 w-5" />
                <span>Cobratec TI · Inventário</span>
              </Link>
              <nav className="flex items-center gap-1 text-sm">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>
          <main className="container py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}

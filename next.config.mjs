const dev = process.env.NODE_ENV !== "production";

// Content-Security-Policy.
//
// O 'unsafe-inline' fica: o Next injeta <script> de hidratação e <style> inline,
// e removê-los exigiria nonce por requisição (incompatível com as páginas
// estáticas deste app). Em desenvolvimento o HMR ainda precisa de 'unsafe-eval'
// e de websocket.
//
// Mesmo assim a diretiva paga: `default-src 'self'` barra script, iframe, fonte
// e conexão de qualquer outra origem, `form-action 'self'` impede que um HTML
// injetado poste o cofre de senhas para fora, e `object-src 'none'` mata plugin
// legado. A app não usa nenhum recurso externo — as fontes vêm do next/font e a
// logo é SVG em componente —, então nada aqui restringe o que já existe.
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

// Headers de segurança aplicados a todas as respostas. Mitigam clickjacking
// (X-Frame-Options + frame-ancestors), sniffing de MIME (nosniff), vazamento de
// referrer e injeção de conteúdo de terceiros (CSP).
const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Gera um servidor mínimo e autocontido em .next/standalone,
  // deixando a imagem Docker muito mais enxuta.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

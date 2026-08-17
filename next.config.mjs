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
  experimental: {
    // Habilita `instrumentation.ts`, o único gancho de subida do servidor —
    // é por ele que o agendador liga. Na linha 14.2 ainda é experimental; a
    // partir do Next 15 passa a ser padrão e esta chave sai.
    instrumentationHook: true,
  },
  // O `instrumentation.ts` é compilado para os DOIS runtimes — Node e Edge —,
  // e o Edge existe aqui por causa do middleware. A guarda
  // `NEXT_RUNTIME === "nodejs"` impede a execução, mas não a compilação: o
  // webpack segue o `import()` mesmo dentro do `if` e vai parar no `pg`, que
  // usa `fs`, `net` e `stream`. O build quebra com "Module not found: fs".
  //
  // Cortar a aresta é o único jeito honesto: no Edge, `@/lib/agendador` vira
  // módulo vazio. Nada se perde porque o código atrás da guarda nunca roda ali
  // — e se um dia alguém tentar usar o agendador de dentro do middleware, vai
  // receber um erro imediato em vez de um agendador que finge funcionar.
  // `IgnorePlugin` e não `resolve.alias`: o alias casa com a STRING do import, e
  // "@/lib/..." não é um alias de webpack neste projeto — é um path do
  // tsconfig, resolvido antes por outro caminho. O alias passava batido em
  // silêncio, que é o pior jeito de uma correção não funcionar.
  webpack: (config, { nextRuntime, webpack }) => {
    if (nextRuntime !== "nodejs") {
      config.plugins.push(
        new webpack.IgnorePlugin({ resourceRegExp: /^@\/lib\/agendador$/ }),
      );
    }
    return config;
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

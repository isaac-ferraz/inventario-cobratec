// Headers de segurança aplicados a todas as respostas. Mitigam clickjacking
// (X-Frame-Options), sniffing de MIME (nosniff) e vazamento de referrer.
// CSP estrita foi deixada de fora por ora para não quebrar os estilos inline
// do Next/Tailwind — avaliar depois se o app for exposto além da LAN.
const securityHeaders = [
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

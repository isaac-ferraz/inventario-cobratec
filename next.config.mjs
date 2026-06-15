/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Gera um servidor mínimo e autocontido em .next/standalone,
  // deixando a imagem Docker muito mais enxuta.
  output: "standalone",
};

export default nextConfig;

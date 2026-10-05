import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera um servidor Node mínimo em .next/standalone com só as dependências
  // usadas: é o que deixa a imagem Docker de produção pequena.
  output: "standalone",

  // Não anuncia "X-Powered-By: Next.js": não há motivo para contar a um
  // atacante qual tecnologia (e versão) o servidor usa.
  poweredByHeader: false,

  // O navegador sempre chama /api/* no próprio frontend (mesma origem: sem CORS,
  // e o cookie do refresh token fica no mesmo domínio). Em dev, o Next repassa
  // para a API pela rede do Docker. Em produção, quem faz isso é o Nginx.
  async rewrites() {
    const apiUrl = process.env.API_INTERNAL_URL;
    if (!apiUrl) return [];
    return [{ source: "/api/:path*", destination: `${apiUrl}/:path*` }];
  },
};

export default nextConfig;

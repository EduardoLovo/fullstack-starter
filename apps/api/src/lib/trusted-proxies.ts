import { lookup } from "node:dns/promises";
import { env } from "../env.js";

// Só confiamos no cabeçalho X-Forwarded-For quando a conexão vem de um proxy
// que sobrescreve esse cabeçalho (o Nginx). Se a API confiasse em qualquer um
// (trustProxy: true), quem acessasse a API direto poderia mandar um
// X-Forwarded-For falso a cada requisição e burlar o rate limit do login.
//
// Os IPs dos containers mudam quando eles são recriados, então descobrimos
// os IPs pelo nome do serviço (DNS do Docker) e atualizamos periodicamente.

const hosts = env.TRUSTED_PROXY_HOSTS.split(",")
  .map((host) => host.trim())
  .filter(Boolean);

let trustedIps = new Set<string>();

async function refresh() {
  const next = new Set<string>();
  for (const host of hosts) {
    const addresses = await lookup(host, { all: true }).catch(() => []);
    for (const { address } of addresses) next.add(address);
  }
  trustedIps = next;
}

export async function startTrustedProxyRefresh() {
  if (hosts.length === 0) return;
  await refresh();
  setInterval(refresh, 30_000).unref();
}

// Assinatura esperada pelo Fastify em `trustProxy`.
export function isTrustedProxy(address: string) {
  return trustedIps.has(address.replace(/^::ffff:/, ""));
}

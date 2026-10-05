import { randomInt, randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll } from "vitest";
import { buildApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { redis } from "../src/lib/redis.js";
import { emailQueue } from "../src/queues/email.queue.js";
import type { EmailJob } from "../src/queues/email.types.js";

// Sobe a aplicação uma vez por arquivo de teste. As requisições usam
// app.inject(): passam por todos os plugins e rotas, sem abrir porta de rede.
export function setupApp() {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildApp();
    await app.ready();
    // Zera os contadores de rate limit deixados pelos arquivos anteriores.
    const keys = await redis.keys("ratelimit:*");
    if (keys.length > 0) await redis.del(keys);
  });

  afterAll(async () => {
    await app.close();
    await emailQueue.close();
    await prisma.$disconnect();
    redis.disconnect();
  });

  return () => app;
}

// Cada "cliente" de teste usa um IP diferente: o rate limit é por IP, e sem
// isso os testes esbarrariam no limite (5 logins ou 100 requisições por minuto).
export function uniqueIp() {
  return `10.${randomInt(256)}.${randomInt(256)}.${randomInt(1, 255)}`;
}

export const uniqueEmail = (prefix = "user") => `${prefix}.${randomUUID().slice(0, 8)}@teste.dev`;

export const PASSWORD = "Senha1234";

export type TestUser = { id: string; email: string; ip: string; accessToken: string; refreshToken: string };

export function refreshTokenFrom(response: { cookies: { name: string; value: string }[] }) {
  return response.cookies.find((cookie) => cookie.name === "refresh_token")?.value ?? "";
}

export async function createUser(
  app: FastifyInstance,
  { role = "USER" as "USER" | "ADMIN", name = "Usuário Teste" } = {},
): Promise<TestUser> {
  const email = uniqueEmail(role.toLowerCase());
  const ip = uniqueIp(); // o "computador" deste usuário
  const register = await app.inject({
    method: "POST",
    url: "/auth/register",
    remoteAddress: ip,
    payload: { name, email, password: PASSWORD },
  });
  const { user } = register.json();

  if (role === "ADMIN") {
    await prisma.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  }

  // Login depois de definir o perfil: o token já sai com o role certo.
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    remoteAddress: ip,
    payload: { email, password: PASSWORD },
  });

  return {
    id: user.id,
    email,
    ip,
    accessToken: login.json().accessToken,
    refreshToken: refreshTokenFrom(login),
  };
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

// Os e-mails não são enviados nos testes (não há worker rodando): conferimos
// os jobs que a API colocou na fila.
export async function emailJobsFor(to: string, template?: EmailJob["template"]) {
  const jobs = await emailQueue.getJobs(["waiting", "delayed", "active", "completed"]);
  return jobs
    .filter((job) => job.data.to === to && (!template || job.data.template === template))
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((job) => job.data);
}

export function resetTokenFrom(job: EmailJob) {
  if (job.template !== "password-reset") throw new Error("não é um e-mail de redefinição");
  return new URL(job.resetUrl).searchParams.get("token")!;
}

import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import sensible from "@fastify/sensible";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify from "fastify";
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { env } from "./env.js";
import { redis } from "./lib/redis.js";
import { isTrustedProxy, startTrustedProxyRefresh } from "./lib/trusted-proxies.js";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { usersRoutes } from "./modules/users/users.routes.js";
import { tasksRoutes } from "./modules/tasks/tasks.routes.js";
import authPlugin from "./plugins/auth.js";
import cachePlugin from "./plugins/cache.js";
import metricsPlugin from "./plugins/metrics.js";

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      // Log colorido em dev; JSON puro em produção (melhor para ferramentas de log).
      transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
    },
    // Atrás do Nginx, o IP real do cliente vem no X-Forwarded-For. Só aceitamos
    // esse cabeçalho quando a conexão vem de um proxy confiável (ver trusted-proxies.ts).
    trustProxy: isTrustedProxy,
  }).withTypeProvider<ZodTypeProvider>();

  await startTrustedProxyRefresh();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Muitos clientes HTTP mandam "Content-Type: application/json" mesmo sem corpo
  // (ex.: num DELETE), e o Fastify responderia 400. Aceitamos corpo vazio, mas
  // o resto continua passando pelo parser padrão, que barra JSON malformado e
  // ataques de "prototype poisoning" (chaves __proto__ e constructor).
  const parseJson = app.getDefaultJsonParser("error", "error");
  app.removeContentTypeParser("application/json");
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    const text = body.toString(); // parseAs: "string" já entrega texto; isto só satisfaz o tipo
    if (text === "") return done(null, undefined);
    parseJson(request, text, done);
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: env.CORS_ORIGIN.split(","), credentials: true });
  await app.register(cookie);
  await app.register(sensible);

  // Contadores do rate limit ficam no Redis: funciona mesmo com várias
  // réplicas da API rodando ao mesmo tempo.
  await app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: "1 minute",
    redis,
    nameSpace: "ratelimit:",
    // Se o Redis cair, a API continua respondendo (só sem rate limit)
    // em vez de derrubar todas as rotas junto.
    skipOnError: true,
  });

  await app.register(swagger, {
    openapi: {
      info: { title: "Fullstack Starter API", version: "0.1.0" },
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
        },
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: "/docs" });

  await app.register(authPlugin);
  await app.register(metricsPlugin);
  await app.register(cachePlugin);

  await app.register(healthRoutes);
  await app.register(authRoutes, { prefix: "/auth" });
  await app.register(usersRoutes, { prefix: "/users" });
  await app.register(tasksRoutes, { prefix: "/tasks" });

  return app;
}

import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { redis } from "../../lib/redis.js";

// Responde "down" se a dependência falhar ou demorar mais de 2s,
// para o healthcheck nunca ficar esperando.
function check(probe: Promise<unknown>) {
  const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 2000));
  return Promise.race([probe, timeout]).then(() => "up", () => "down");
}

// Usado pelo healthcheck do Docker: o container só fica "healthy"
// quando a API consegue falar com o banco e com o Redis.
export const healthRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/health",
    {
      config: { rateLimit: false },
      logLevel: "warn",
      schema: {
        tags: ["health"],
        response: {
          200: z.object({ status: z.literal("ok"), database: z.string(), redis: z.string() }),
          503: z.object({ status: z.literal("error"), database: z.string(), redis: z.string() }),
        },
      },
    },
    async (_request, reply) => {
      const [database, cache] = await Promise.all([
        check(prisma.$queryRaw`SELECT 1`),
        check(redis.ping()),
      ]);

      const healthy = database === "up" && cache === "up";
      return reply
        .status(healthy ? 200 : 503)
        .send({ status: healthy ? "ok" : "error", database, redis: cache });
    },
  );
};

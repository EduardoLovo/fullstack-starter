import { createHash } from "node:crypto";
import type { FastifyRequest } from "fastify";
import fp from "fastify-plugin";
import { keys, redis } from "../lib/redis.js";

// Cache de respostas no Redis (padrão "cache-aside"), declarado na rota:
//
//   app.get("/", { config: { cache: { namespace: (req) => `tasks:${req.user.sub}`, ttlSeconds: 60 } } }, ...)
//
// - HIT:  devolve o JSON guardado direto, sem consultar o banco nem serializar de novo.
// - MISS: executa a rota normalmente e guarda a resposta (só status 200).
// - Header X-Cache: HIT | MISS, para ver o cache funcionando.
//
// Invalidação por versão: cada namespace tem um contador (cache-version:<ns>)
// que faz parte da chave. Para invalidar, basta incrementar o contador: as
// chaves antigas deixam de ser lidas e expiram sozinhas pelo TTL. Isso evita
// procurar chaves com KEYS/SCAN, que é lento com muitas chaves.

export type RouteCacheConfig = {
  // Grupo de chaves invalidado junto. Para dados de um usuário, SEMPRE inclua
  // o id dele, senão um usuário pode receber a resposta em cache de outro.
  namespace: (request: FastifyRequest) => string;
  ttlSeconds: number;
};

declare module "fastify" {
  interface FastifyContextConfig {
    cache?: RouteCacheConfig;
  }
  interface FastifyRequest {
    cacheKey?: string;
  }
}

export async function invalidateCache(namespace: string) {
  // Se o Redis estiver fora, não há o que invalidar (e o cache também não está
  // sendo lido): não vale derrubar a escrita no banco por isso.
  await redis.incr(keys.cacheVersion(namespace)).catch(() => {});
}

export default fp(async (app) => {
  // preHandler roda DEPOIS da autenticação (onRequest) e da validação, então
  // request.user já existe e só requisições válidas chegam ao cache.
  app.addHook("preHandler", async (request, reply) => {
    const config = request.routeOptions.config.cache;
    if (!config || request.method !== "GET") return;

    try {
      const namespace = config.namespace(request);
      const version = (await redis.get(keys.cacheVersion(namespace))) ?? "0";
      // A URL inclui a query string: ?page=2 e ?page=3 viram chaves diferentes.
      const urlHash = createHash("sha1").update(request.url).digest("hex");
      const cacheKey = keys.cacheEntry(namespace, version, urlHash);

      const cached = await redis.get(cacheKey);
      if (cached) {
        return reply.header("x-cache", "HIT").type("application/json; charset=utf-8").send(cached);
      }
      request.cacheKey = cacheKey;
    } catch (error) {
      // Redis fora: segue sem cache (fail-open), direto no banco.
      request.log.warn({ error }, "Cache indisponível, consultando o banco");
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
    if (!request.cacheKey) return payload;

    reply.header("x-cache", "MISS");
    if (reply.statusCode === 200 && typeof payload === "string") {
      const ttl = request.routeOptions.config.cache!.ttlSeconds;
      await redis.set(request.cacheKey, payload, "EX", ttl).catch(() => {});
    }
    return payload;
  });
});

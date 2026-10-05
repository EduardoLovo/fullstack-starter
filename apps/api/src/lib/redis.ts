import { Redis } from "ioredis";
import { env } from "../env.js";

// Conexão usada pela API. Com enableOfflineQueue: false, se o Redis cair os
// comandos falham na hora, em vez de ficarem enfileirados esperando a reconexão
// (o que deixaria cada requisição presa por vários segundos).
// O worker do BullMQ vai ter a própria conexão, com outras regras.
export const redis = new Redis(env.REDIS_URL, { enableOfflineQueue: false });

redis.on("error", (error: Error & { code?: string }) => {
  console.error(`[redis] ${error.code ?? error.message}`);
});

// Prefixos das chaves, para deixar o uso do Redis fácil de inspecionar
// (ex.: redis-cli KEYS 'refresh:*').
export const keys = {
  refreshToken: (tokenHash: string) => `refresh:${tokenHash}`,
  userSessions: (userId: string) => `sessions:${userId}`,
  revokedAccessToken: (jti: string) => `denylist:${jti}`,
};

import { createHash, randomBytes } from "node:crypto";
import { env } from "../../env.js";
import { keys, redis } from "../../lib/redis.js";

// Refresh tokens são valores aleatórios (não JWT) guardados no Redis.
// Guardamos só o hash: se alguém ler o Redis, não consegue usar os tokens.
//
//   refresh:<hash>    -> userId           (expira sozinho após N dias)
//   sessions:<userId> -> { hash, hash, … } (permite "deslogar de todos os dispositivos")

const REFRESH_TTL_SECONDS = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createRefreshToken(userId: string) {
  const token = randomBytes(48).toString("base64url");
  const tokenHash = hashToken(token);

  await redis
    .multi()
    .set(keys.refreshToken(tokenHash), userId, "EX", REFRESH_TTL_SECONDS)
    .sadd(keys.userSessions(userId), tokenHash)
    .expire(keys.userSessions(userId), REFRESH_TTL_SECONDS)
    .exec();

  return { token, maxAgeSeconds: REFRESH_TTL_SECONDS };
}

// Consome o token (GETDEL é atômico): cada refresh token só pode ser usado uma vez.
// Isso é a "rotação" de refresh token: um token roubado e reutilizado é rejeitado.
export async function consumeRefreshToken(token: string) {
  const tokenHash = hashToken(token);
  const userId = await redis.getdel(keys.refreshToken(tokenHash));
  if (userId) {
    await redis.srem(keys.userSessions(userId), tokenHash);
  }
  return userId;
}

export async function revokeRefreshToken(token: string) {
  await consumeRefreshToken(token);
}

export async function revokeAllSessions(userId: string) {
  const hashes = await redis.smembers(keys.userSessions(userId));
  const pipeline = redis.multi();
  for (const tokenHash of hashes) {
    pipeline.del(keys.refreshToken(tokenHash));
  }
  pipeline.del(keys.userSessions(userId));
  await pipeline.exec();
}

// Access tokens (JWT) não podem ser "apagados", então no logout guardamos o
// jti numa denylist até o momento em que o token expiraria de qualquer forma.
export async function revokeAccessToken(jti: string, expiresAtEpochSeconds: number) {
  const ttl = expiresAtEpochSeconds - Math.floor(Date.now() / 1000);
  if (ttl > 0) {
    await redis.set(keys.revokedAccessToken(jti), "1", "EX", ttl);
  }
}

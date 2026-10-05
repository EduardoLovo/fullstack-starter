import fastifyJwt from "@fastify/jwt";
import fp from "fastify-plugin";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "../generated/prisma/client.js";
import { env } from "../env.js";
import { keys, redis } from "../lib/redis.js";

export type AccessTokenPayload = {
  sub: string;
  role: Role;
  jti: string;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: AccessTokenPayload;
    user: AccessTokenPayload & { iat: number; exp: number };
  }
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (...roles: Role[]) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async (app) => {
  await app.register(fastifyJwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.ACCESS_TOKEN_TTL_SECONDS },
  });

  // Valida o access token e confere se ele não foi revogado (logout).
  app.decorate("authenticate", async (request: FastifyRequest) => {
    try {
      await request.jwtVerify();
    } catch {
      throw app.httpErrors.unauthorized("Token inválido ou expirado");
    }

    const revoked = await redis.exists(keys.revokedAccessToken(request.user.jti));
    if (revoked) {
      throw app.httpErrors.unauthorized("Token revogado");
    }
  });

  app.decorate("requireRole", (...roles: Role[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await app.authenticate(request, reply);
      if (!roles.includes(request.user.role)) {
        throw app.httpErrors.forbidden("Sem permissão para este recurso");
      }
    };
  });
});

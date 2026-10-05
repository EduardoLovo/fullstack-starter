import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { env } from "../../env.js";
import { prisma } from "../../lib/prisma.js";
import { publicUserSelect } from "../users/users.schemas.js";
import { authResponseSchema, loginBodySchema, registerBodySchema } from "./auth.schemas.js";
import {
  consumeRefreshToken,
  createRefreshToken,
  revokeAccessToken,
  revokeRefreshToken,
} from "./token-store.js";

const REFRESH_COOKIE = "refresh_token";

// Hash usado quando o e-mail não existe: assim o login leva o mesmo tempo
// com ou sem usuário, e ninguém descobre e-mails cadastrados pelo tempo de resposta.
const DUMMY_HASH = await argon2.hash("dummy-password-for-timing");

export const authRoutes: FastifyPluginAsyncZod = async (app) => {
  async function issueSession(reply: FastifyReply, user: { id: string; role: "USER" | "ADMIN" }) {
    const accessToken = app.jwt.sign({ sub: user.id, role: user.role, jti: randomUUID() });
    const refresh = await createRefreshToken(user.id);

    reply.setCookie(REFRESH_COOKIE, refresh.token, {
      httpOnly: true, // JavaScript do navegador não consegue ler
      secure: env.COOKIE_SECURE,
      sameSite: "strict",
      path: "/",
      maxAge: refresh.maxAgeSeconds,
    });

    return accessToken;
  }

  app.post(
    "/register",
    {
      schema: {
        tags: ["auth"],
        body: registerBodySchema,
        response: { 201: authResponseSchema },
      },
    },
    async (request, reply) => {
      const { name, email, password } = request.body;

      const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (exists) {
        throw app.httpErrors.conflict("E-mail já cadastrado");
      }

      const user = await prisma.user.create({
        data: { name, email, passwordHash: await argon2.hash(password) },
        select: publicUserSelect,
      });

      const accessToken = await issueSession(reply, user);
      return reply.status(201).send({ accessToken, user });
    },
  );

  app.post(
    "/login",
    {
      config: {
        // Limite mais rígido que o global: protege contra força bruta de senha.
        rateLimit: { max: 5, timeWindow: "1 minute" },
      },
      schema: {
        tags: ["auth"],
        body: loginBodySchema,
        response: { 200: authResponseSchema },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;

      const user = await prisma.user.findUnique({
        where: { email },
        select: { ...publicUserSelect, passwordHash: true },
      });

      const passwordOk = await argon2.verify(user?.passwordHash ?? DUMMY_HASH, password);
      if (!user || !passwordOk) {
        throw app.httpErrors.unauthorized("E-mail ou senha inválidos");
      }
      if (user.status === "BLOCKED") {
        throw app.httpErrors.forbidden("Usuário bloqueado");
      }

      const { passwordHash: _, ...publicUser } = user;
      const accessToken = await issueSession(reply, publicUser);
      return { accessToken, user: publicUser };
    },
  );

  app.post(
    "/refresh",
    {
      schema: {
        tags: ["auth"],
        response: { 200: authResponseSchema },
      },
    },
    async (request, reply) => {
      const token = request.cookies[REFRESH_COOKIE];
      const userId = token ? await consumeRefreshToken(token) : null;
      if (!userId) {
        reply.clearCookie(REFRESH_COOKIE, { path: "/" });
        throw app.httpErrors.unauthorized("Sessão expirada, faça login novamente");
      }

      const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUserSelect });
      if (!user || user.status === "BLOCKED") {
        reply.clearCookie(REFRESH_COOKIE, { path: "/" });
        throw app.httpErrors.unauthorized("Sessão inválida");
      }

      const accessToken = await issueSession(reply, user);
      return { accessToken, user };
    },
  );

  app.post(
    "/logout",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["auth"],
        security: [{ bearerAuth: [] }],
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await revokeAccessToken(request.user.jti, request.user.exp);

      const token = request.cookies[REFRESH_COOKIE];
      if (token) {
        await revokeRefreshToken(token);
      }

      reply.clearCookie(REFRESH_COOKIE, { path: "/" });
      return reply.status(204).send(null);
    },
  );
};

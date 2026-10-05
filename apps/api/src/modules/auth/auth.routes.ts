import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import type { FastifyReply } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { env } from "../../env.js";
import { prisma } from "../../lib/prisma.js";
import { enqueueEmail } from "../../queues/email.queue.js";
import { publicUserSelect } from "../users/users.schemas.js";
import {
  authResponseSchema,
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
} from "./auth.schemas.js";
import {
  consumePasswordResetToken,
  consumeRefreshToken,
  createPasswordResetToken,
  createRefreshToken,
  revokeAccessToken,
  revokeAllSessions,
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

      // Se a fila falhar, o cadastro não deve falhar junto: só registra o erro.
      await enqueueEmail({ template: "welcome", to: user.email, name: user.name }).catch((error) =>
        request.log.error({ error }, "Não foi possível enfileirar o e-mail de boas-vindas"),
      );

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
    "/forgot-password",
    {
      config: { rateLimit: { max: 3, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        body: forgotPasswordBodySchema,
        response: { 202: z.object({ message: z.string() }) },
      },
    },
    async (request, reply) => {
      const { email } = request.body;

      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, name: true, email: true, status: true },
      });

      if (user && user.status === "ACTIVE") {
        try {
          const token = await createPasswordResetToken(user.id);
          const resetUrl = new URL("/reset-password", env.APP_URL);
          resetUrl.searchParams.set("token", token);

          await enqueueEmail({
            template: "password-reset",
            to: user.email,
            name: user.name,
            resetUrl: resetUrl.toString(),
            expiresInMinutes: env.PASSWORD_RESET_TTL_MINUTES,
          });
        } catch (error) {
          // Não devolve 500 aqui: um erro que só acontece para e-mails
          // cadastrados revelaria quem tem conta.
          request.log.error({ error }, "Não foi possível gerar o link de redefinição");
        }
      }

      // Mesma resposta exista o e-mail ou não: a rota não pode servir para
      // descobrir quem tem conta. 202 = "aceito, vai ser processado".
      return reply.status(202).send({
        message: "Se o e-mail estiver cadastrado, você vai receber um link para redefinir a senha.",
      });
    },
  );

  app.post(
    "/reset-password",
    {
      config: { rateLimit: { max: 5, timeWindow: "1 minute" } },
      schema: {
        tags: ["auth"],
        body: resetPasswordBodySchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      const { token, password } = request.body;

      const userId = await consumePasswordResetToken(token);
      if (!userId) {
        throw app.httpErrors.badRequest("Link inválido ou expirado, peça um novo");
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await argon2.hash(password) },
        select: { id: true, name: true, email: true },
      });

      // Senha nova = todas as sessões antigas caem (inclusive a de quem
      // eventualmente roubou a senha anterior).
      await revokeAllSessions(user.id);

      await enqueueEmail({ template: "password-changed", to: user.email, name: user.name }).catch(
        (error) => request.log.error({ error }, "Não foi possível enfileirar o aviso de senha alterada"),
      );

      return reply.status(204).send(null);
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

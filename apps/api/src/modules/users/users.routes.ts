import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { revokeAllSessions } from "../auth/token-store.js";
import {
  listUsersQuerySchema,
  publicUserSchema,
  publicUserSelect,
  updateUserBodySchema,
} from "./users.schemas.js";

export const usersRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/me",
    {
      onRequest: [app.authenticate],
      schema: {
        tags: ["users"],
        security: [{ bearerAuth: [] }],
        response: { 200: publicUserSchema },
      },
    },
    async (request) => {
      const user = await prisma.user.findUnique({
        where: { id: request.user.sub },
        select: publicUserSelect,
      });
      if (!user) {
        throw app.httpErrors.notFound("Usuário não encontrado");
      }
      return user;
    },
  );

  // ---- Rotas de administração ----

  app.get(
    "/",
    {
      onRequest: [app.requireRole("ADMIN")],
      schema: {
        tags: ["users (admin)"],
        security: [{ bearerAuth: [] }],
        querystring: listUsersQuerySchema,
        response: {
          200: z.object({
            data: z.array(publicUserSchema),
            meta: z.object({ page: z.number(), perPage: z.number(), total: z.number() }),
          }),
        },
      },
    },
    async (request) => {
      const { page, perPage, search } = request.query;

      const where: Prisma.UserWhereInput = search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { email: { contains: search, mode: "insensitive" } },
            ],
          }
        : {};

      const [data, total] = await prisma.$transaction([
        prisma.user.findMany({
          where,
          select: publicUserSelect,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        prisma.user.count({ where }),
      ]);

      return { data, meta: { page, perPage, total } };
    },
  );

  app.patch(
    "/:id",
    {
      onRequest: [app.requireRole("ADMIN")],
      schema: {
        tags: ["users (admin)"],
        security: [{ bearerAuth: [] }],
        params: z.object({ id: z.uuid() }),
        body: updateUserBodySchema,
        response: { 200: publicUserSchema },
      },
    },
    async (request) => {
      const { id } = request.params;

      if (id === request.user.sub) {
        throw app.httpErrors.badRequest("Você não pode alterar o próprio perfil ou status");
      }

      const exists = await prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (!exists) {
        throw app.httpErrors.notFound("Usuário não encontrado");
      }

      const user = await prisma.user.update({
        where: { id },
        data: request.body,
        select: publicUserSelect,
      });

      // Bloqueou ou mudou o perfil: derruba as sessões para valer na hora
      // (o usuário precisa logar de novo e recebe um token com o perfil novo).
      await revokeAllSessions(id);

      return user;
    },
  );
};

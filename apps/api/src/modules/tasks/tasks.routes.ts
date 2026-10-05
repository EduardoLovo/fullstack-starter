import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Prisma } from "../../generated/prisma/client.js";
import { prisma } from "../../lib/prisma.js";
import { invalidateCache } from "../../plugins/cache.js";
import {
  createTaskBodySchema,
  listTasksQuerySchema,
  taskParamsSchema,
  taskSchema,
  taskSelect,
  updateTaskBodySchema,
} from "./tasks.schemas.js";

// Módulo de exemplo com CRUD completo. Para criar um recurso novo,
// copie esta pasta e troque "task" pelo nome do recurso.

// Cada usuário tem o próprio grupo de cache: invalidar as tarefas da Maria
// não afeta o cache do João, e um nunca recebe a resposta em cache do outro.
const cacheNamespace = (request: FastifyRequest) => `tasks:${request.user.sub}`;

export const tasksRoutes: FastifyPluginAsyncZod = async (app) => {
  // Todas as rotas deste módulo exigem login.
  app.addHook("onRequest", app.authenticate);

  // Garante que a tarefa existe E pertence ao usuário. Responde 404 (e não 403)
  // para não confirmar que existe uma tarefa com esse id de outra pessoa.
  async function findOwnTask(id: string, userId: string) {
    const task = await prisma.task.findFirst({ where: { id, userId }, select: { id: true } });
    if (!task) {
      throw app.httpErrors.notFound("Tarefa não encontrada");
    }
  }

  app.get(
    "/",
    {
      config: { cache: { namespace: cacheNamespace, ttlSeconds: 60 } },
      schema: {
        tags: ["tasks"],
        security: [{ bearerAuth: [] }],
        querystring: listTasksQuerySchema,
        response: {
          200: z.object({
            data: z.array(taskSchema),
            meta: z.object({ page: z.number(), perPage: z.number(), total: z.number() }),
          }),
        },
      },
    },
    async (request) => {
      const { page, perPage, status, search } = request.query;

      const where: Prisma.TaskWhereInput = {
        userId: request.user.sub,
        status,
        ...(search && {
          OR: [
            { title: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } },
          ],
        }),
      };

      const [data, total] = await prisma.$transaction([
        prisma.task.findMany({
          where,
          select: taskSelect,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * perPage,
          take: perPage,
        }),
        prisma.task.count({ where }),
      ]);

      return { data, meta: { page, perPage, total } };
    },
  );

  app.get(
    "/:id",
    {
      config: { cache: { namespace: cacheNamespace, ttlSeconds: 60 } },
      schema: {
        tags: ["tasks"],
        security: [{ bearerAuth: [] }],
        params: taskParamsSchema,
        response: { 200: taskSchema },
      },
    },
    async (request) => {
      const task = await prisma.task.findFirst({
        where: { id: request.params.id, userId: request.user.sub },
        select: taskSelect,
      });
      if (!task) {
        throw app.httpErrors.notFound("Tarefa não encontrada");
      }
      return task;
    },
  );

  app.post(
    "/",
    {
      schema: {
        tags: ["tasks"],
        security: [{ bearerAuth: [] }],
        body: createTaskBodySchema,
        response: { 201: taskSchema },
      },
    },
    async (request, reply) => {
      const task = await prisma.task.create({
        data: { ...request.body, userId: request.user.sub },
        select: taskSelect,
      });
      await invalidateCache(cacheNamespace(request));
      return reply.status(201).send(task);
    },
  );

  app.patch(
    "/:id",
    {
      schema: {
        tags: ["tasks"],
        security: [{ bearerAuth: [] }],
        params: taskParamsSchema,
        body: updateTaskBodySchema,
        response: { 200: taskSchema },
      },
    },
    async (request) => {
      await findOwnTask(request.params.id, request.user.sub);
      const task = await prisma.task.update({
        where: { id: request.params.id },
        data: request.body,
        select: taskSelect,
      });
      await invalidateCache(cacheNamespace(request));
      return task;
    },
  );

  app.delete(
    "/:id",
    {
      schema: {
        tags: ["tasks"],
        security: [{ bearerAuth: [] }],
        params: taskParamsSchema,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await findOwnTask(request.params.id, request.user.sub);
      await prisma.task.delete({ where: { id: request.params.id } });
      await invalidateCache(cacheNamespace(request));
      return reply.status(204).send(null);
    },
  );
};

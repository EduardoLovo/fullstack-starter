import { z } from "zod";

export const taskStatusSchema = z.enum(["TODO", "IN_PROGRESS", "DONE"]);

export const taskSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  dueDate: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const taskSelect = {
  id: true,
  title: true,
  description: true,
  status: true,
  dueDate: true,
  createdAt: true,
  updatedAt: true,
} as const;

export const taskParamsSchema = z.object({ id: z.uuid() });

export const listTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  status: taskStatusSchema.optional(),
  search: z.string().trim().min(1).optional(),
});

export const createTaskBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  status: taskStatusSchema.optional(),
  dueDate: z.coerce.date().optional(),
});

export const updateTaskBodySchema = createTaskBodySchema
  .extend({
    // null permite apagar a descrição ou o prazo
    description: z.string().trim().max(5000).nullable().optional(),
    dueDate: z.coerce.date().nullable().optional(),
  })
  .partial()
  .refine((body) => Object.keys(body).length > 0, "Informe pelo menos um campo");

import { z } from "zod";

export const roleSchema = z.enum(["USER", "ADMIN"]);
export const statusSchema = z.enum(["ACTIVE", "BLOCKED"]);

// Formato público do usuário: nunca expõe passwordHash.
export const publicUserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  role: roleSchema,
  status: statusSchema,
  avatarUrl: z.string().nullable(),
  createdAt: z.date(),
});

export const publicUserSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  avatarUrl: true,
  createdAt: true,
} as const;

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().optional(),
});

export const updateUserBodySchema = z
  .object({
    role: roleSchema.optional(),
    status: statusSchema.optional(),
  })
  .refine((body) => body.role || body.status, "Informe role e/ou status");

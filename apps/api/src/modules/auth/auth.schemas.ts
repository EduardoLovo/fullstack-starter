import { z } from "zod";
import { publicUserSchema } from "../users/users.schemas.js";

const passwordSchema = z
  .string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres")
  .max(128)
  .regex(/[A-Za-z]/, "A senha precisa ter pelo menos uma letra")
  .regex(/\d/, "A senha precisa ter pelo menos um número");

export const registerBodySchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().toLowerCase(),
  password: passwordSchema,
});

export const forgotPasswordBodySchema = z.object({
  email: z.email().toLowerCase(),
});

export const resetPasswordBodySchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});

export const loginBodySchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
});

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: publicUserSchema,
});

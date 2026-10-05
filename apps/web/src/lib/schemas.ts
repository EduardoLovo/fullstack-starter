import { z } from "zod";

// Mesmas regras da API: o formulário avisa antes de enviar,
// e a API valida de novo (nunca confiar só no frontend).

export const passwordSchema = z
  .string()
  .min(8, "A senha precisa ter pelo menos 8 caracteres")
  .max(128, "Máximo de 128 caracteres")
  .regex(/[A-Za-z]/, "A senha precisa ter pelo menos uma letra")
  .regex(/\d/, "A senha precisa ter pelo menos um número");

export const loginSchema = z.object({
  email: z.email("E-mail inválido"),
  password: z.string().min(1, "Informe a senha"),
});

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, "Informe pelo menos 2 caracteres").max(100),
    email: z.email("E-mail inválido"),
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({
  email: z.email("E-mail inválido"),
});

export const resetPasswordSchema = z
  .object({
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não conferem",
    path: ["confirmPassword"],
  });

export const taskFormSchema = z.object({
  title: z.string().trim().min(1, "Informe um título").max(200, "Máximo de 200 caracteres"),
  description: z.string().trim().max(5000, "Máximo de 5000 caracteres"),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]),
  dueDate: z.string(), // "AAAA-MM-DD" do <input type="date">, ou vazio
});

export type TaskFormValues = z.infer<typeof taskFormSchema>;

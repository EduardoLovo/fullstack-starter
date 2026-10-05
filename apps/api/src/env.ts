import { z } from "zod";

// Valida as variáveis de ambiente na subida: se faltar algo, a API nem inicia
// (falhar cedo é melhor do que quebrar no meio de uma requisição).
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3333),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z.url(),
  REDIS_URL: z.url(),

  JWT_SECRET: z.string().min(32, "JWT_SECRET precisa ter pelo menos 32 caracteres"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(7),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(30),

  // Endereço do frontend: usado para montar o link do e-mail de redefinição de senha.
  APP_URL: z.url().default("http://localhost:3000"),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),
  // Nomes dos serviços que são proxies confiáveis (ex.: "nginx,web").
  // Vazio = não confia em ninguém e usa o IP da conexão.
  TRUSTED_PROXY_HOSTS: z.string().default(""),
  COOKIE_SECURE: z.stringbool().default(false),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variáveis de ambiente inválidas:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

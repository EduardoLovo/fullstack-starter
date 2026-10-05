import { z } from "zod";

// O worker tem as próprias variáveis: não precisa de JWT nem de banco,
// só do Redis (para ler a fila) e do SMTP (para enviar).
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.string().default("info"),

  REDIS_URL: z.url(),

  SMTP_HOST: z.string(),
  SMTP_PORT: z.coerce.number().default(1025),
  SMTP_SECURE: z.stringbool().default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("Fullstack Starter <no-reply@starter.dev>"),

  // Porta interna onde o Prometheus lê as métricas do worker.
  METRICS_PORT: z.coerce.number().default(9464),

  // Quantos e-mails o worker envia ao mesmo tempo.
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(5),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Variáveis de ambiente do worker inválidas:");
  console.error(z.prettifyError(parsed.error));
  process.exit(1);
}

export const env = parsed.data;

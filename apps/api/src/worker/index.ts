import { writeFile } from "node:fs/promises";
import { Worker } from "bullmq";
import { Redis } from "ioredis";
import { pino } from "pino";
import { EMAIL_QUEUE, type EmailJob } from "../queues/email.types.js";
import { env } from "./env.js";
import { mailer } from "./mailer.js";
import { renderEmail } from "./templates.js";

// Processo separado da API: roda no container "worker", com a mesma imagem
// mas outro comando. Pode escalar sozinho: docker compose up --scale worker=3

const log = pino({
  level: env.LOG_LEVEL,
  transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
});

// O worker fica bloqueado esperando jobs no Redis, por isso precisa de
// maxRetriesPerRequest: null (exigência do BullMQ para workers).
const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });

const worker = new Worker<EmailJob>(
  EMAIL_QUEUE,
  async (job) => {
    const email = renderEmail(job.data);
    const info = await mailer.sendMail({
      from: env.MAIL_FROM,
      to: job.data.to,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });
    return { messageId: info.messageId };
  },
  { connection, concurrency: env.WORKER_CONCURRENCY },
);

worker.on("ready", () => log.info(`Worker ouvindo a fila "${EMAIL_QUEUE}"`));
worker.on("completed", (job) =>
  log.info({ jobId: job.id, template: job.name, to: job.data.to }, "E-mail enviado"),
);
worker.on("failed", (job, error) =>
  log.warn(
    { jobId: job?.id, template: job?.name, attempt: job?.attemptsMade, error: error.message },
    "Falha ao enviar e-mail (vai tentar de novo se ainda houver tentativas)",
  ),
);
worker.on("error", (error) => log.error({ error: error.message }, "Erro no worker"));

// Healthcheck sem HTTP: o worker não tem porta aberta, então a cada 10s ele
// grava a hora num arquivo. O Docker considera o container saudável enquanto
// esse arquivo continuar sendo atualizado e o Redis estiver conectado.
const HEARTBEAT_FILE = "/tmp/worker-heartbeat";
const heartbeat = setInterval(async () => {
  if (worker.isRunning() && connection.status === "ready") {
    await writeFile(HEARTBEAT_FILE, String(Date.now())).catch(() => {});
  }
}, 10_000);

// Desligamento gracioso: termina os e-mails em andamento antes de sair,
// para nenhum job ficar pela metade quando o container for parado.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    log.info(`${signal} recebido, terminando jobs em andamento...`);
    clearInterval(heartbeat);
    await worker.close();
    connection.disconnect();
    process.exit(0);
  });
}

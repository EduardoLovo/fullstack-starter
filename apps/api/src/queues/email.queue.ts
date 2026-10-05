import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { env } from "../env.js";
import { EMAIL_QUEUE, type EmailJob } from "./email.types.js";

// A fila usa uma conexão própria com o Redis. Em projetos ESM o BullMQ não
// consegue criar o cliente sozinho, então passamos uma instância do ioredis.
// enableOfflineQueue: false -> se o Redis estiver fora, falha na hora em vez
// de deixar a requisição presa (mesma regra da conexão principal da API).
export const emailQueue = new Queue<EmailJob>(EMAIL_QUEUE, {
  connection: new Redis(env.REDIS_URL, { enableOfflineQueue: false }),
  defaultJobOptions: {
    // Com 5 tentativas a partir de 5s, o worker desistia depois de ~75s: uma
    // queda curta do SMTP já perdia e-mails (visto no dashboard). Com 9 tentativas,
    // a espera dobra a cada falha (5s, 10s, 20s... ~21min) e cobre quedas de ~40min.
    attempts: 9,
    backoff: { type: "exponential", delay: 5_000 },
    removeOnComplete: { age: 24 * 60 * 60, count: 1000 }, // guarda os concluídos por 1 dia
    removeOnFail: { age: 7 * 24 * 60 * 60 }, // e os que falharam por 7 dias, para investigar
  },
});

export async function enqueueEmail(job: EmailJob) {
  await emailQueue.add(job.template, job);
}

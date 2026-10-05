import nodemailer from "nodemailer";
import { env } from "./env.js";

// Em dev aponta para o Mailpit (nada sai de verdade para a internet).
// Em produção, basta trocar as variáveis SMTP_* por um provedor real.
export const mailer = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: env.SMTP_SECURE,
  auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  // Os padrões do nodemailer chegam a 2 minutos: com o SMTP fora do ar, cada job
  // ficaria travado esse tempo todo ocupando uma vaga do worker. Melhor falhar
  // rápido e deixar o BullMQ tentar de novo com backoff.
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 30_000,
});

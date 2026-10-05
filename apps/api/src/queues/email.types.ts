// Contrato compartilhado entre a API (que coloca e-mails na fila) e o worker
// (que envia). A API só diz QUAL e-mail mandar e com quais dados; o HTML e o
// envio por SMTP ficam no worker. Assim, se o SMTP estiver lento ou fora do ar,
// a requisição do usuário não espera nem falha por isso.

export const EMAIL_QUEUE = "email";

export type EmailJob =
  | { template: "welcome"; to: string; name: string }
  | { template: "password-reset"; to: string; name: string; resetUrl: string; expiresInMinutes: number }
  | { template: "password-changed"; to: string; name: string };

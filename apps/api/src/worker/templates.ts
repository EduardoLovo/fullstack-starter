import type { EmailJob } from "../queues/email.types.js";

type RenderedEmail = { subject: string; html: string; text: string };

// O nome vem do cadastro (texto livre do usuário): sempre escapar antes
// de colocar no HTML, senão alguém se cadastra com <script> ou um link falso.
const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

function layout(title: string, body: string) {
  return `<!doctype html>
<html lang="pt-BR">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,sans-serif;color:#18181b">
    <table role="presentation" width="100%" style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:32px">
      <tr><td>
        <h1 style="font-size:20px;margin:0 0 16px">${title}</h1>
        ${body}
        <p style="font-size:12px;color:#71717a;margin-top:32px">Fullstack Starter</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

const button = (href: string, label: string) =>
  `<p><a href="${escapeHtml(href)}" style="display:inline-block;background:#18181b;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none">${label}</a></p>`;

export function renderEmail(job: EmailJob): RenderedEmail {
  const name = escapeHtml(job.name);

  switch (job.template) {
    case "welcome":
      return {
        subject: "Bem-vindo(a) ao Fullstack Starter",
        html: layout(`Olá, ${name}!`, `<p>Sua conta foi criada com sucesso.</p>`),
        text: `Olá, ${job.name}! Sua conta foi criada com sucesso.`,
      };

    case "password-reset":
      return {
        subject: "Redefinição de senha",
        html: layout(
          "Redefinir sua senha",
          `<p>Olá, ${name}. Recebemos um pedido para redefinir a sua senha.</p>
           ${button(job.resetUrl, "Criar nova senha")}
           <p style="font-size:14px;color:#52525b">O link vale por ${job.expiresInMinutes} minutos e só pode ser usado uma vez.
           Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>`,
        ),
        text:
          `Olá, ${job.name}. Para redefinir sua senha, acesse: ${job.resetUrl}\n` +
          `O link vale por ${job.expiresInMinutes} minutos. Se não foi você, ignore este e-mail.`,
      };

    case "password-changed":
      return {
        subject: "Sua senha foi alterada",
        html: layout(
          "Senha alterada",
          `<p>Olá, ${name}. A senha da sua conta acabou de ser alterada e todas as sessões abertas foram encerradas.</p>
           <p style="font-size:14px;color:#52525b">Se não foi você, redefina a senha imediatamente.</p>`,
        ),
        text: `Olá, ${job.name}. A senha da sua conta foi alterada. Se não foi você, redefina a senha imediatamente.`,
      };
  }
}

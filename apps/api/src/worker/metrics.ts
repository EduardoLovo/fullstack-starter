import { createServer } from "node:http";
import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

// O worker não tem servidor HTTP, então ganha um mínimo só para expor /metrics
// numa porta interna (não publicada). O Prometheus lê pela rede do Docker.

const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const emailsSent = new Counter({
  name: "emails_sent_total",
  help: "E-mails enviados com sucesso, por template",
  labelNames: ["template"] as const,
  registers: [registry],
});

export const emailFailures = new Counter({
  name: "email_send_failures_total",
  help: "Tentativas de envio que falharam (cada tentativa conta, inclusive as que serão repetidas)",
  labelNames: ["template"] as const,
  registers: [registry],
});

export const emailSendDuration = new Histogram({
  name: "email_send_duration_seconds",
  help: "Tempo para entregar o e-mail ao servidor SMTP",
  labelNames: ["template"] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export function startMetricsServer(port: number) {
  const server = createServer(async (request, response) => {
    if (request.url !== "/metrics") {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": registry.contentType });
    response.end(await registry.metrics());
  });
  server.listen(port, "0.0.0.0");
  return server;
}

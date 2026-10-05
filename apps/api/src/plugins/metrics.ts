import fp from "fastify-plugin";
import { Gauge } from "prom-client";
import { httpRequestDuration, registry } from "../lib/metrics.js";
import { emailQueue } from "../queues/email.queue.js";

export default fp(async (app) => {
  // Tamanho da fila de e-mails por estado. É calculado na hora da coleta
  // (quando o Prometheus lê /metrics), consultando o BullMQ no Redis.
  new Gauge({
    name: "email_queue_jobs",
    help: "Jobs na fila de e-mails, por estado",
    labelNames: ["state"] as const,
    registers: [registry],
    async collect() {
      const counts = await emailQueue.getJobCounts("waiting", "active", "delayed", "failed", "completed");
      for (const [state, count] of Object.entries(counts)) {
        this.set({ state }, count);
      }
    },
  });

  app.addHook("onResponse", async (request, reply) => {
    // Modelo da rota (/tasks/:id), não a URL real: mantém poucas séries.
    const route = request.routeOptions.url ?? "unmatched";
    if (route === "/metrics") return;

    httpRequestDuration.observe(
      { method: request.method, route, status_code: String(reply.statusCode) },
      reply.elapsedTime / 1000,
    );
  });

  // Lida pelo Prometheus pela rede interna do Docker. O Nginx bloqueia
  // /api/metrics: essas informações não devem ficar públicas.
  app.get("/metrics", { config: { rateLimit: false }, logLevel: "warn", schema: { hide: true } }, async (_request, reply) => {
    reply.type(registry.contentType);
    return registry.metrics();
  });
});

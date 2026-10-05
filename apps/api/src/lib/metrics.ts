import { collectDefaultMetrics, Counter, Histogram, Registry } from "prom-client";

// Métricas da aplicação no formato do Prometheus. Cada processo (API e worker)
// tem o próprio registro e expõe as métricas numa rota /metrics, que o
// Prometheus lê a cada 15s.
//
// Cuidado com a "cardinalidade": cada combinação de labels vira uma série
// separada no Prometheus. Por isso as labels usam o MODELO da rota
// (/tasks/:id) e nunca o valor (/tasks/3f2a...), nem ids de usuário.

export const registry = new Registry();

// Métricas do próprio Node: CPU, memória (heap), event loop lag, GC...
collectDefaultMetrics({ register: registry });

export const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duração das requisições HTTP",
  labelNames: ["method", "route", "status_code"] as const,
  // Faixas pensadas para uma API: de 5ms a 2,5s.
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5],
  registers: [registry],
});

export const cacheRequests = new Counter({
  name: "cache_requests_total",
  help: "Leituras do cache de respostas, por recurso e resultado (hit/miss)",
  labelNames: ["resource", "result"] as const,
  registers: [registry],
});

export const authEvents = new Counter({
  name: "auth_events_total",
  help: "Eventos de autenticação (login, falha, cadastro, redefinição de senha...)",
  labelNames: ["event"] as const,
  registers: [registry],
});

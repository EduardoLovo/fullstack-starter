// Simula usuários usando a aplicação, para o dashboard ter o que mostrar.
//   docker compose -f compose.yaml -f compose.monitoring.yaml run --rm k6
//
// Todo o tráfego sai de um único container (um IP só), então o ritmo fica
// abaixo do rate limit global da API (100 requisições/minuto por IP).
// As poucas tentativas de login com senha errada são de propósito: aparecem
// no painel de autenticação, e algumas acabam barradas pelo rate limit (429).

import http from "k6/http";
import { check, sleep } from "k6";

const BASE_URL = __ENV.BASE_URL || "http://nginx/api";
const JSON_HEADERS = { "Content-Type": "application/json" };

export const options = {
  scenarios: {
    usuarios: { executor: "constant-vus", vus: 2, duration: __ENV.DURATION || "5m" },
  },
  thresholds: {
    // O teste "passa" se 95% das requisições responderem em menos de 500ms.
    http_req_duration: ["p(95)<500"],
  },
};

// Roda uma vez: cria usuários de teste e devolve os tokens para os VUs.
export function setup() {
  const users = [];
  for (let i = 0; i < 3; i++) {
    const email = `k6.${Date.now()}.${i}@teste.dev`;
    const response = http.post(
      `${BASE_URL}/auth/register`,
      JSON.stringify({ name: `Usuário k6 ${i}`, email, password: "Senha1234" }),
      { headers: JSON_HEADERS },
    );
    check(response, { "cadastro 201": (r) => r.status === 201 });
    users.push(response.json("accessToken"));
  }
  return { users };
}

const statuses = ["TODO", "IN_PROGRESS", "DONE"];
const pick = (list) => list[Math.floor(Math.random() * list.length)];

export default function ({ users }) {
  const params = { headers: { ...JSON_HEADERS, Authorization: `Bearer ${pick(users)}` } };
  const roll = Math.random();

  if (roll < 0.5) {
    // Leitura (a maior parte do tráfego real): a repetição gera acertos no cache.
    const query = pick(["", "?status=TODO", "?status=DONE", "?page=1&perPage=5"]);
    check(http.get(`${BASE_URL}/tasks${query}`, params), { "listar 200": (r) => r.status === 200 });
  } else if (roll < 0.75) {
    const created = http.post(
      `${BASE_URL}/tasks`,
      JSON.stringify({ title: `Tarefa ${Math.floor(Math.random() * 1000)}`, status: pick(statuses) }),
      params,
    );
    check(created, { "criar 201": (r) => r.status === 201 });
  } else if (roll < 0.95) {
    // Atualiza ou exclui uma tarefa existente (invalida o cache do usuário).
    const list = http.get(`${BASE_URL}/tasks?perPage=10`, params);
    const tasks = list.status === 200 ? list.json("data") : [];
    if (tasks.length > 0) {
      const task = pick(tasks);
      if (Math.random() < 0.7) {
        http.patch(`${BASE_URL}/tasks/${task.id}`, JSON.stringify({ status: pick(statuses) }), params);
      } else {
        http.del(`${BASE_URL}/tasks/${task.id}`, null, params);
      }
    }
  } else {
    // Login com senha errada (401, e 429 quando passa do limite por minuto).
    http.post(
      `${BASE_URL}/auth/login`,
      JSON.stringify({ email: "invasor@teste.dev", password: "chute123" }),
      { headers: JSON_HEADERS },
    );
  }

  sleep(2.5 + Math.random() * 2);
}

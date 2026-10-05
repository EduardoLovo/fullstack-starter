import { expect, it } from "vitest";
import { bearer, createUser, setupApp } from "./helpers.js";

const getApp = setupApp();

it("expõe métricas no formato do Prometheus, com o modelo da rota (sem ids)", async () => {
  const app = getApp();
  const user = await createUser(app);
  const headers = bearer(user.accessToken);
  const { id } = (await app.inject({ method: "POST", url: "/tasks", headers, payload: { title: "x" } })).json();
  await app.inject({ method: "GET", url: `/tasks/${id}`, headers });
  await app.inject({ method: "GET", url: `/tasks/${id}`, headers }); // segunda leitura: HIT

  const response = await app.inject({ method: "GET", url: "/metrics" });
  expect(response.statusCode).toBe(200);
  expect(response.headers["content-type"]).toContain("text/plain");

  const metrics = response.body;
  expect(metrics).toMatch(/http_request_duration_seconds_count\{method="GET",route="\/tasks\/:id",status_code="200"\}/);
  expect(metrics).not.toContain(id); // o id real nunca vira label
  expect(metrics).toMatch(/cache_requests_total\{resource="tasks",result="hit"\} [1-9]/);
  expect(metrics).toMatch(/auth_events_total\{event="register"\}/);
  expect(metrics).toMatch(/email_queue_jobs\{state="waiting"\}/);
  expect(metrics).toContain("nodejs_eventloop_lag_seconds");
});

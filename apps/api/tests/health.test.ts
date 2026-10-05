import { expect, it } from "vitest";
import { setupApp } from "./helpers.js";

const getApp = setupApp();

it("health informa banco e Redis no ar", async () => {
  const response = await getApp().inject({ method: "GET", url: "/health" });
  expect(response.statusCode).toBe(200);
  expect(response.json()).toEqual({ status: "ok", database: "up", redis: "up" });
});

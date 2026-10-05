import { defineConfig } from "vitest/config";

// Os testes rodam contra PostgreSQL e Redis de verdade (não mocks), num banco
// separado (starter_test) e no índice 1 do Redis, para não misturar com dev.
// Localmente usam os containers do compose; no CI, os "services" do GitHub Actions.
const testEnv = {
  NODE_ENV: "test",
  LOG_LEVEL: "silent",
  DATABASE_URL:
    process.env.TEST_DATABASE_URL ?? "postgresql://starter:starter_dev_password@localhost:5432/starter_test",
  REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://:redis_dev_password@localhost:6379/1",
  JWT_SECRET: "segredo-apenas-para-testes-com-mais-de-32-caracteres",
  APP_URL: "http://localhost:8080",
  TRUSTED_PROXY_HOSTS: "",
};

export default defineConfig({
  test: {
    env: testEnv,
    globalSetup: ["./tests/global-setup.ts"],
    // Os arquivos de teste dividem o mesmo banco e Redis: rodar um de cada vez
    // evita que um interfira no outro.
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
  },
});

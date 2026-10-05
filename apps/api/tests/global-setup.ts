import { execSync } from "node:child_process";
import { Redis } from "ioredis";
import pg from "pg";
import type { TestProject } from "vitest/node";

// Roda uma vez antes de todos os testes: cria o banco de teste se não existir,
// aplica as migrations e limpa os dados da execução anterior.
export default async function setup(project: TestProject) {
  const { DATABASE_URL, REDIS_URL } = project.config.env as Record<string, string>;

  const url = new URL(DATABASE_URL);
  const database = url.pathname.slice(1);
  url.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [database]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${database}"`);
  }
  await admin.end();

  execSync("npx prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL },
    stdio: "ignore",
  });

  const db = new pg.Client({ connectionString: DATABASE_URL });
  await db.connect();
  await db.query("TRUNCATE users, tasks CASCADE");
  await db.end();

  const redis = new Redis(REDIS_URL);
  await redis.flushdb();
  await redis.quit();
}

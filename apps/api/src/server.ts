import { buildApp } from "./app.js";
import { env } from "./env.js";
import { prisma } from "./lib/prisma.js";
import { redis } from "./lib/redis.js";

const app = await buildApp();

// Desligamento gracioso: o `docker stop` envia SIGTERM. Paramos de aceitar
// requisições, terminamos as que estão em andamento e fechamos as conexões.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} recebido, encerrando...`);
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  });
}

try {
  // 0.0.0.0 é obrigatório dentro do container: "localhost" só aceitaria
  // conexões vindas de dentro do próprio container.
  await app.listen({ host: "0.0.0.0", port: env.PORT });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}

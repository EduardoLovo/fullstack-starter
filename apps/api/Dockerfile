# syntax=docker/dockerfile:1

# ============================================================
# Multi-stage build: cada FROM é um "estágio". Os estágios de
# build têm compilador, devDependencies etc.; a imagem final
# (prod) copia só o resultado e fica pequena e mais segura.
#
#   base ─┬─ deps ─┬─ dev        (docker compose em desenvolvimento)
#         │        ├─ migrate    (roda as migrations e sai)
#         │        └─ build ──┐
#         └─ prod-deps ───────┴─ prod (imagem final)
# ============================================================

FROM node:24-slim AS base
WORKDIR /app
# O CLI do Prisma (migrations) precisa do OpenSSL, que a imagem slim não traz.
# A imagem final (prod) não usa o CLI, então não precisa dele.
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
# Valor só para o `prisma generate` funcionar no build; não é usado em runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"


# ---- Todas as dependências (inclui devDependencies) ----
FROM base AS deps
# Copiar só package*.json primeiro aproveita o cache de camadas:
# se você mudar só o código, o `npm ci` não roda de novo.
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci


# ---- Desenvolvimento: hot reload com tsx ----
FROM deps AS dev
COPY . .
RUN npx prisma generate
EXPOSE 3333
# `exec` faz o tsx substituir o shell e virar o processo principal: assim ele
# recebe o SIGTERM do `docker stop` e o desligamento gracioso funciona.
# (Com `npm run dev`, o npm fica no meio e não repassa o sinal direito.)
CMD ["sh", "-c", "npx prisma migrate deploy && exec ./node_modules/.bin/tsx watch src/server.ts"]


# ---- Migrations (serviço que roda uma vez e termina) ----
# Também roda o seed do admin:  docker compose run --rm migrate npx prisma db seed
FROM deps AS migrate
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npx prisma generate
CMD ["npx", "prisma", "migrate", "deploy"]


# ---- Compila TypeScript -> JavaScript ----
FROM deps AS build
COPY . .
RUN npx prisma generate && npm run build


# ---- Só dependências de produção ----
FROM base AS prod-deps
COPY package.json package-lock.json ./
# O @prisma/client declara `prisma` e `typescript` como peers opcionais. Como os
# dois estão no lockfile (como devDependencies), o `npm ci --omit=dev` instala
# eles mesmo assim, junto com o Prisma Studio (com React): ~280MB sem uso em
# produção. O `npm uninstall` remove os dois, e só afeta este estágio do build.
RUN --mount=type=cache,target=/root/.npm \
  npm ci --omit=dev \
  && npm uninstall prisma typescript --omit=dev


# ---- Imagem final ----
FROM node:24-slim AS prod
WORKDIR /app
ENV NODE_ENV=production

COPY --from=prod-deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./

# Não roda como root: se alguém explorar uma falha na API,
# não ganha permissão de root dentro do container.
USER node

EXPOSE 3333
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3333/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]

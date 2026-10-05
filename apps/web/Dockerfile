# syntax=docker/dockerfile:1

# ============================================================
#   base ─ deps ─┬─ dev     (next dev com hot reload)
#                └─ build ─ prod (servidor standalone, sem node_modules completo)
# ============================================================

FROM node:24-alpine AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1


FROM base AS deps
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci


# ---- Desenvolvimento ----
FROM deps AS dev
COPY . .
EXPOSE 3000
# -H 0.0.0.0: aceita conexões de fora do container (o padrão seria só localhost).
# Chamando o next direto (sem npm) para o SIGTERM do `docker stop` chegar nele.
CMD ["./node_modules/.bin/next", "dev", "-H", "0.0.0.0", "-p", "3000"]


# ---- Build de produção ----
FROM deps AS build
COPY . .
RUN npm run build


# ---- Imagem final ----
# Com output: "standalone", o Next gera um server.js com APENAS as dependências
# que o app realmente usa. A imagem não leva o node_modules inteiro (~500MB+).
FROM node:24-alpine AS prod
WORKDIR /app
# Em produção o container só executa "node": npm, yarn e corepack não são
# usados e trazem dependências próprias com vulnerabilidades (apontadas pelo Trivy).
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build --chown=node:node /app/.next/standalone ./
# Arquivos estáticos (JS/CSS do navegador) não entram no standalone: copiar à parte.
COPY --from=build --chown=node:node /app/.next/static ./.next/static

USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]

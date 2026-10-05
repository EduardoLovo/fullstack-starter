# Fullstack Starter

Base reutilizável para projetos full-stack, 100% containerizada.

**Stack:** Next.js · Fastify · Prisma · PostgreSQL · Redis · BullMQ · Nginx · Docker Compose

## Arquitetura

```
┌──────────┐    ┌──────────┐    ┌────────────┐
│  Nginx   │───▶│   web    │    │ PostgreSQL │
│ (proxy)  │    │ (Next.js)│    └────────────┘
│          │───▶│   api    │───▶     ▲
└──────────┘    │ (Fastify)│───▶ ┌───────┐
                └──────────┘     │ Redis │
                ┌──────────┐───▶ └───────┘
                │  worker  │ (fila de e-mails)
                └──────────┘
+ Mailpit (caixa de e-mail falsa em dev)
```

## Como rodar

```bash
cp .env.example .env              # e troque o JWT_SECRET
docker compose up --watch         # sobe tudo com hot reload
docker compose exec api npm run db:seed   # cria o usuário admin
```

| Serviço | Endereço |
|---|---|
| API | http://localhost:3333 |
| Documentação da API (Swagger) | http://localhost:3333/docs |
| Mailpit (e-mails) | http://localhost:8025 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

## API

| Método | Rota | Acesso |
|---|---|---|
| GET | `/health` | público |
| POST | `/auth/register` | público |
| POST | `/auth/login` | público (5 tentativas/min por IP) |
| POST | `/auth/refresh` | cookie `refresh_token` |
| POST | `/auth/logout` | autenticado |
| POST | `/auth/forgot-password` | público (3/min por IP) |
| POST | `/auth/reset-password` | token do e-mail (5/min por IP) |
| GET | `/users/me` | autenticado |
| GET | `/users` | admin |
| PATCH | `/users/:id` | admin |

### Como a autenticação usa o Redis

- **Access token** (JWT, 15 min) vai no header `Authorization: Bearer`.
- **Refresh token** (7 dias) é um valor aleatório num cookie `httpOnly`. O Redis guarda só o hash dele.
- **Rotação:** cada refresh token só pode ser usado uma vez (`GETDEL`). Um token roubado e reutilizado é rejeitado.
- **Logout:** o `jti` do access token entra numa *denylist* no Redis até o horário em que ele expiraria.
- **Bloquear usuário / trocar perfil:** derruba todas as sessões dele na hora.
- **Rate limit:** os contadores ficam no Redis, então funcionam com várias réplicas da API.

## Worker e fila de e-mails

A API não envia e-mail: ela só coloca um job na fila (Redis + BullMQ) e responde na hora.
O **worker** é um processo separado (mesma imagem, outro comando) que consome a fila e envia por SMTP.

| Cenário | O que acontece |
|---|---|
| Worker fora do ar | O cadastro funciona normalmente; o e-mail espera na fila e sai quando o worker volta |
| SMTP fora do ar | O worker tenta até 5 vezes com backoff exponencial (5s, 10s, 20s, 40s) |
| `docker compose stop worker` | O worker recebe SIGTERM, termina os envios em andamento e só então sai |
| Precisa de mais vazão | `docker compose up -d --scale worker=3` |

Outros detalhes:
- **Redefinição de senha:** token aleatório de uso único, válido por 30 min e guardado só como hash. Pedir um link novo invalida o anterior, e redefinir a senha derruba todas as sessões.
- **Não revela quem tem conta:** `/auth/forgot-password` responde igual exista o e-mail ou não.
- **HTML escapado:** o nome do usuário é escapado no template (um nome como `<img onerror=...>` não vira HTML).
- **Healthcheck sem HTTP:** o worker não tem porta aberta, então grava um "batimento" num arquivo a cada 10s, e o Docker confere a idade desse arquivo.
- **Sinais e PID 1:** os containers usam `init: true` e chamam o processo direto (sem `npm` no meio), senão o SIGTERM do `docker stop` não chega à aplicação e o desligamento gracioso não roda.

Os e-mails de dev aparecem no Mailpit: http://localhost:8025

## Roadmap

- [x] Infra: PostgreSQL, Redis, Mailpit
- [x] API: Fastify + Prisma, auth com JWT + refresh token, perfis (admin/user)
- [x] Redis: rate limit, sessões, revogação de tokens
- [x] Dockerfile multi-stage da API (dev, migrate, prod)
- [ ] Redis: cache de listagens
- [x] Worker: fila de e-mails com BullMQ (boas-vindas, redefinição de senha, aviso de senha alterada)
- [ ] Web: Next.js + Tailwind + shadcn/ui
- [ ] Nginx como reverse proxy
- [ ] Compose de produção (imagens prod + Nginx)

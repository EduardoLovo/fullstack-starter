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

## Roadmap

- [x] Infra: PostgreSQL, Redis, Mailpit
- [x] API: Fastify + Prisma, auth com JWT + refresh token, perfis (admin/user)
- [x] Redis: rate limit, sessões, revogação de tokens
- [x] Dockerfile multi-stage da API (dev, migrate, prod)
- [ ] Redis: cache de listagens
- [ ] Worker: fila de e-mails com BullMQ
- [ ] Web: Next.js + Tailwind + shadcn/ui
- [ ] Nginx como reverse proxy
- [ ] Compose de produção (imagens prod + Nginx)

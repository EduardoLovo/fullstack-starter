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
| **Aplicação (entrada pelo Nginx)** | http://localhost:8080 |
| API pelo Nginx | http://localhost:8080/api |
| Documentação da API (Swagger) | http://localhost:8080/api/docs |
| Acesso direto, para depurar | frontend :3000, API :3333 |
| Mailpit (e-mails) | http://localhost:8025 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

## Produção

```bash
cp .env.prod.example .env.prod      # e troque todos os segredos
docker compose -f compose.prod.yaml --env-file .env.prod up -d --build
docker compose -f compose.prod.yaml --env-file .env.prod run --rm migrate npx prisma db seed
```

O [compose.prod.yaml](compose.prod.yaml) é independente do de dev (tem outro nome de projeto), então os dois podem rodar ao mesmo tempo.

| | Dev (`compose.yaml`) | Produção (`compose.prod.yaml`) |
|---|---|---|
| Imagens | estágio `dev`, hot reload | estágio `prod`: sem devDependencies, sem root |
| Portas publicadas | todas (para depurar) | **só o Nginx** |
| Migrations | ao subir a API | serviço `migrate`, que roda e termina antes da API subir |
| Sistema de arquivos | gravável | **somente leitura** (só `/tmp` em memória) |
| Capabilities do Linux | padrão | **nenhuma** (`cap_drop: ALL`, `no-new-privileges`) |
| Rede | uma só | `backend` **interna, sem internet**; só o worker tem saída (SMTP) |
| Recursos | sem limite | limite de CPU e memória por serviço |
| Logs | sem limite | rotação (3 arquivos de 10MB) |
| Variáveis | com valores padrão | obrigatórias: se faltar alguma, o compose não sobe |

Verificado:
- Os testes de autenticação passam pelo Nginx de produção.
- Os containers da aplicação rodam como `node`, com capabilities zeradas, e recusam gravação em `/app`.
- A API não alcança a internet; o worker alcança.
- O cookie de sessão sai com `HttpOnly; Secure; SameSite=Strict`.
- Os dados sobrevivem a `down`/`up`, e o `migrate` da segunda subida não reaplica nada.

Uso de memória em repouso: API ~80MB, worker ~45MB, web ~40MB, Postgres ~40MB, Nginx ~10MB, Redis ~6MB.

Para colocar na internet de verdade, falta o HTTPS: um proxy com certificado automático (Caddy, Traefik) ou o balanceador do provedor de nuvem na frente do Nginx.

## Nginx (proxy reverso)

Porta única de entrada: `/` vai para o Next.js, e `/api/*` vai para a API (sem o prefixo). Para o navegador, tudo é um site só. Configuração em [nginx/default.conf](nginx/default.conf).

- **Resolução dinâmica de DNS:** por padrão, o Nginx resolve o nome `api` uma vez só, quando sobe. Se a API for recriada com outro IP, ele passa a responder 502. Com `resolver 127.0.0.11` (o DNS do Docker) e `server api:3333 resolve`, ele acompanha a troca de IP sem precisar reiniciar (testado forçando um IP novo).
- **IP real do cliente sem brecha:** o Nginx **sobrescreve** o `X-Forwarded-For`, e a API só aceita esse cabeçalho quando a conexão vem do Nginx (o IP dele é descoberto pelo DNS). Antes, com `trustProxy: true`, quem acessasse a API direto podia mandar um IP falso a cada tentativa e burlar o rate limit do login. O proxy do Next fica de fora da lista de confiança porque repassa o cabeçalho que o cliente mandou.
- **WebSocket:** o hot reload do Next funciona através do Nginx.
- **gzip:** os arquivos JS ficam de 4 a 6 vezes menores.
- **Cabeçalhos de segurança:** `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, sem `Server` com versão e sem `X-Powered-By`.
- **Limite de upload** de 5MB: acima disso o Nginx responde 413, sem a requisição chegar à API.
- `keepalive` com os upstreams, log com tempo de resposta e healthcheck em `/nginx-health`.

Para aplicar uma mudança no arquivo sem derrubar o container:
```bash
docker compose exec nginx nginx -s reload
```

## Frontend

Next.js 16 (App Router), Tailwind CSS 4, shadcn/ui, React Query e React Hook Form + Zod.

| Tela | O que faz |
|---|---|
| `/login`, `/register` | Entrar e criar conta, com validação nos campos |
| `/forgot-password`, `/reset-password` | Recuperação de senha pelo link enviado por e-mail |
| `/tasks` | Tarefas: criar, editar, mudar status, excluir, buscar, filtrar e paginar |
| `/admin/users` | Só para admin: buscar usuários, trocar perfil, bloquear e desbloquear |

Decisões importantes:
- **Mesma origem:** o navegador só chama `/api/*` no próprio frontend, e o Next repassa para a API pela rede do Docker. Assim não há CORS, e o cookie do refresh token fica no domínio do site.
- **Access token só em memória**, nunca no `localStorage`, onde um script injetado (XSS) conseguiria ler. Ao recarregar a página, a sessão volta pelo cookie `httpOnly`.
- **Renovação automática:** uma chamada que recebe 401 renova o token e é repetida. Renovações simultâneas são unificadas numa só, porque cada refresh token só pode ser usado uma vez.
- **Cache visível:** as listas mostram se a resposta veio do Redis ou do PostgreSQL (header `X-Cache`).
- **Sem redirecionamento aberto:** o `?next=` do login só aceita caminhos internos.
- Modo claro/escuro e layout responsivo.
- **Imagem de produção** com `output: "standalone"`: leva só as dependências usadas (38MB de `node_modules`) e roda sem root.

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
| GET | `/users` | admin (com cache) |
| PATCH | `/users/:id` | admin |
| GET | `/tasks` | autenticado (com cache, filtros `status` e `search`, paginação) |
| GET | `/tasks/:id` | autenticado (com cache) |
| POST | `/tasks` | autenticado |
| PATCH | `/tasks/:id` | autenticado |
| DELETE | `/tasks/:id` | autenticado |

O módulo `tasks` é o **módulo de exemplo**: um CRUD completo, em que cada usuário só acessa as próprias tarefas. Para criar um recurso novo, copie `apps/api/src/modules/tasks` e troque "task" pelo nome do recurso.

### Como a autenticação usa o Redis

- **Access token** (JWT, 15 min) vai no header `Authorization: Bearer`.
- **Refresh token** (7 dias) é um valor aleatório num cookie `httpOnly`. O Redis guarda só o hash dele.
- **Rotação:** cada refresh token só pode ser usado uma vez (`GETDEL`). Um token roubado e reutilizado é rejeitado.
- **Logout:** o `jti` do access token entra numa *denylist* no Redis até o horário em que ele expiraria.
- **Bloquear usuário / trocar perfil:** derruba todas as sessões dele na hora.
- **Rate limit:** os contadores ficam no Redis, então funcionam com várias réplicas da API.

### Cache de respostas

O cache é declarado na própria rota, sem lógica espalhada pelos handlers:

```ts
app.get("/", { config: { cache: { namespace: (req) => `tasks:${req.user.sub}`, ttlSeconds: 60 } } }, handler);
```

- **HIT:** devolve o JSON guardado no Redis, sem consultar o banco nem serializar de novo. O header `X-Cache: HIT | MISS` mostra o que aconteceu.
- **Invalidação por versão:** cada grupo de chaves tem um contador no Redis que faz parte da chave. Criar, editar ou excluir incrementa o contador, e as chaves antigas expiram sozinhas pelo TTL. Não precisa procurar chaves com `KEYS`/`SCAN`.
- **Isolado por usuário:** o cache de tarefas inclui o id do usuário, então um usuário nunca recebe a resposta em cache de outro.
- **Fail-open:** se o Redis falhar na leitura do cache, a rota consulta o banco normalmente.
- **Medição** (1.000 tarefas, páginas de 100 itens): MISS 7,3ms e HIT 2,6ms (2,8x). O ganho é maior com consultas mais pesadas e banco sob carga.

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
- [x] Redis: cache de respostas com invalidação por versão
- [x] Módulo de exemplo (tarefas) com CRUD completo
- [x] Worker: fila de e-mails com BullMQ (boas-vindas, redefinição de senha, aviso de senha alterada)
- [x] Web: Next.js + Tailwind + shadcn/ui (login, cadastro, senha, tarefas, admin)
- [x] Nginx como reverse proxy (porta única, DNS dinâmico, IP real do cliente, gzip)
- [x] Compose de produção (só o Nginx exposto, containers endurecidos, migrations em serviço próprio)

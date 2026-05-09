# Gracie SaaS

SaaS multi-tenant para gestão comercial de academias. Primeiro cliente: **Gracie Barra Anália Franco**. Construído pela Simplifica Online.

> **Status: Fase 12/12 — MVP completo, pronto pra produção.**
> Stack final: Next 16 standalone Docker → Docker Swarm com Traefik (Let's
> Encrypt) → Postgres no swarm → Cloudflare R2 (backup). Deploy automatizado
> via GitHub Actions (build → GHCR → SSH manager → `docker stack deploy`).

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) — note: spec dizia "14+", `create-next-app@latest` puxou v16 |
| UI | Tailwind CSS v4 + shadcn/ui (new-york), lucide-react |
| Linguagem | TypeScript estrito |
| Banco | PostgreSQL 16 (Docker Compose) |
| ORM | **Prisma 7** com `@prisma/adapter-pg` (v7 mudou: `url` saiu do `schema.prisma` e foi pra `prisma.config.ts`; PrismaClient exige `adapter` explícito) |
| Auth | Auth.js v5 (`next-auth@beta`) com Credentials provider |
| Validação | Zod v4 |
| Hash de senha | bcryptjs |

> **Breaking changes com que tive que lidar:**
> - **Next 16:** `middleware.ts` foi renomeado pra **`proxy.ts`**. Mesma assinatura, mesmo runtime Edge.
> - **Prisma 7:** datasource URL não fica mais no schema; vai pra `prisma.config.ts`. PrismaClient precisa de `adapter: new PrismaPg(...)`.
> - **Tailwind 4:** sem `tailwind.config.ts` — toda config é via `@theme inline` em `globals.css`.

## Setup local

### Pré-requisitos

- Node 20+ (testado com Node 24)
- Docker Desktop
- npm 10+

### Passo a passo

```bash
# 1. clonar e instalar
npm install

# 2. configurar variáveis de ambiente
cp .env.example .env
# (.env já tem defaults pra dev — funcionam direto)

# 3. subir Postgres
docker compose up -d

# 4. aplicar schema + gerar client + seed do super-admin
npx prisma db push
npx prisma generate
npm run db:seed

# 5. rodar dev
npm run dev
```

### Acesso por subdomínio

A app usa **`*.localhost`** em dev (RFC 6761 — Chrome/Firefox/Safari resolvem automaticamente para 127.0.0.1, sem mexer no `/etc/hosts`).

| URL | Quem usa |
|---|---|
| [http://gracie.localhost:3000](http://gracie.localhost:3000) | Tenant Gracie Barra (admin do tenant + vendedoras) |
| [http://admin.localhost:3000](http://admin.localhost:3000) | Super-admin (Bruno) — visão agregada de todos os tenants |
| [http://localhost:3000](http://localhost:3000) | Sem contexto de tenant — cai num **picker** após login |

Em produção a mesma lógica funciona com `gracie.app.simplifica.com.br` / `admin.app.simplifica.com.br`. A extração de tenant está em `src/server/tenant-routing.ts` (Edge-safe) e roda igual local e prod.

### Credenciais default (do seed)

| Email | Senha | Papel |
|---|---|---|
| `bruno@simplificaonline.site` | `gracie-2026` | Super-admin (vê tudo) |
| `gracie-admin@example.com` | `gracie-2026` | ADMIN do tenant Gracie |
| `anna@gracie.com` | `gracie-2026` | SELLER (Gracie) |
| `evelyn@gracie.com` | `gracie-2026` | SELLER (Gracie) |
| `rafaela@gracie.com` | `gracie-2026` | SELLER (Gracie) |

Override do super-admin via `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` no `.env`.

> **Nota:** o Postgres do projeto sobe na porta **5433** (a 5432 já é usada pelo `casa-roxa-gestao` na mesma máquina).

## Scripts

```bash
npm run dev          # Next dev (porta 3000, Turbopack)
npm run build        # build de produção
npm run start        # serve build de produção
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm test             # Vitest (run mode, sai com código)
npm run test:watch   # Vitest watch
npm run test:ui      # Vitest UI (browser)

npm run db:push      # aplica schema sem migration file (dev)
npm run db:migrate   # cria + aplica nova migration
npm run db:deploy    # aplica migrations pendentes (produção)
npm run db:studio    # Prisma Studio
npm run db:seed      # roda prisma/seed.ts (idempotente)
npm run db:reset     # reset total + re-seed
npm run db:inspect   # imprime leads + webhook logs do tenant gracie (debug)
npm run db:demo-leads # popula 20 leads de exemplo distribuídos no kanban (idempotente)
npm run db:demo-classes # popula 9 aulas experimentais em estados variados (idempotente)
npm run db:demo-enrollments # cria matrícula de exemplo pra Thiago Mendes (idempotente)
```

## Estrutura

```
src/
  app/                  Pages (App Router)
    api/auth/[...nextauth]/route.ts   handler do Auth.js v5
    admin/page.tsx                    painel super-admin (visão agregada)
    dashboard/page.tsx                dashboard scopado pelo tenant atual
    tenants/page.tsx                  picker (quem vê: user logado sem tenant na URL)
    login/                            login com server action
  components/ui/        primitivos shadcn/ui
  lib/
    prisma.ts           singleton do PrismaClient (com adapter-pg)
    tenant-url.ts       gera URLs de subdomínio (preserva porta/protocolo)
    utils.ts            cn() helper (clsx + tailwind-merge)
  server/
    auth.config.ts      config Edge-safe (sem Prisma/bcrypt) — usado pelo proxy.ts
    auth.ts             config full (Credentials + PrismaAdapter) — Node only
    tenant-routing.ts   Edge-safe: parseTenantFromHost() + sentinels
    tenant.ts           Node: getCurrentTenant, requireTenantUser, requireRole, requireSuperAdmin
  types/
    next-auth.d.ts      module augmentation pra Session.user.id
  proxy.ts              Edge: extrai tenant do host e propaga via x-tenant-slug
prisma/
  schema.prisma         schema completo (Tenant, Lead, Stage, Modality, Plan, ...)
  seed.ts               tenant Gracie + catálogo + admin/sellers (idempotente)
prisma.config.ts        Prisma 7: datasource URL e seed config
docker-compose.yml      Postgres 16 na porta 5433
```

### Por que dois arquivos de config Auth.js?

Auth.js v5 + Edge runtime (proxy.ts) **não** suporta Prisma nem bcrypt. Por isso:

- `auth.config.ts` é Edge-safe: define `pages`, `callbacks.authorized`, sem providers reais. É o que o `proxy.ts` importa.
- `auth.ts` (Node) estende o config adicionando `Credentials` provider, `PrismaAdapter`, `bcrypt.compare`, etc. É o que server actions e route handlers importam.

Mesmo padrão usado em `casa-roxa-gestao` — funciona bem.

## Testes

```bash
npm test              # roda tudo (38 testes em 3 arquivos)
npm run test:watch    # watch mode
```

Testes unitários cobrem o que dá pra cobrir sem rodar Next: parser de
host, builder de URL, hierarquia de roles. **Para o fluxo end-to-end com
sessão real**, siga o checklist em [`docs/manual-smoke.md`](docs/manual-smoke.md)
— 7 cenários manuais no navegador (~5 min).

## Deploy (produção)

Stack: Docker Swarm + Traefik (Let's Encrypt automático) + Postgres compartilhado na rede `simplificanet`. Mesmo padrão dos outros serviços da Simplifica (Chatwoot, n8n, wuzapi).

### Pré-requisitos no manager (servidor `chatwoot`)

- Docker Swarm inicializado
- Rede overlay `simplificanet` existente
- Traefik com `entrypoint=websecure` + `certresolver=letsencryptresolver`
- Postgres rodando como serviço swarm com nome `postgres` (resolvível pelo DNS interno)
- Domínio público apontando pro IP do manager: ex. `bgaf.simplificaonline.site`

### Setup único do banco

```bash
# No manager, copia o SQL pra dentro do container postgres
docker cp scripts/setup-prod-db.sql \
  $(docker ps -qf "label=com.docker.swarm.service.name=postgres_postgres"):/tmp/

# Edita a senha no SQL antes (linha CREATE ROLE) e roda
docker exec -it $(docker ps -qf "label=com.docker.swarm.service.name=postgres_postgres") \
  psql -U postgres -f /tmp/setup-prod-db.sql
```

### Secrets do GitHub (Settings → Secrets and variables → Actions)

| Secret | Valor |
|---|---|
| `MANAGER_HOST` | IP/hostname do manager |
| `MANAGER_USER` | usuário SSH (ex: `root` ou `bruno`) |
| `MANAGER_SSH_KEY` | chave privada SSH (conteúdo, não path) |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `DATABASE_URL` | `postgresql://gracie_saas:SENHA@postgres:5432/gracie_saas?schema=public` |
| `RESEND_API_KEY` | a chave do Resend |
| `EMAIL_FROM` | `Gracie SaaS <noreply@simplificaonline.site>` |
| `TENANT_SLUG` | `bgaf` |
| `TENANT_NAME` | `Gracie Barra Anália Franco` |
| `SEED_ADMIN_EMAIL` | seu email |
| `SEED_ADMIN_PASSWORD` | senha temporária (troque após login) |
| `PUBLIC_HOST` | `bgaf.simplificaonline.site` |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | pra `backup.yml` (Cloudflare R2 — crie um bucket privado) |
| `PG_DB_NAME`, `PG_DB_USER` | `gracie_saas` / `gracie_saas` (pra backup script) |

### Primeiro deploy

1. Push pro `main` no GitHub. O workflow `deploy.yml` builda, pusha imagem pro GHCR, copia `stack.yml` pro manager e roda `docker stack deploy`.
2. **No primeiro deploy apenas**, force `RUN_SEED_ON_BOOT=true` na env do `stack.yml` (ou via Variables do GitHub) pra popular o tenant inicial. Depois remova/seta pra `false` pra evitar re-seed em cada deploy.
3. Acompanhe os logs: `docker service logs -f gracie-saas_app`.
4. Acesse `https://bgaf.simplificaonline.site` (Let's Encrypt vai emitir cert automaticamente — pode demorar ~30s na primeira vez).
5. Logue com `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` e troque a senha em `/settings/usuarios` (ou via Prisma Studio temporariamente).

### Deploys subsequentes

Push pro `main` → CI faz tudo. Migrations Prisma rodam no `entrypoint.sh` antes do `next start` — schema sempre alinhado com código.

### Backup

`backup.yml` roda diariamente às 03:00 UTC (00:00 BRT):
- SSH no manager, `pg_dump` via `docker exec` no container postgres
- Transfere pro runner
- Sobe pro Cloudflare R2 via S3 API (`https://<account>.r2.cloudflarestorage.com`)

Configure retenção via lifecycle rule no painel do R2 (recomendado: 30 dias).

### Restore (em caso de desastre)

```bash
# Baixa backup do R2 pro manager
aws s3 cp s3://gracie-saas-backups/postgres/<arquivo>.sql.gz . \
  --endpoint-url "https://<account>.r2.cloudflarestorage.com"

# Aplica no Postgres do swarm
gunzip -c <arquivo>.sql.gz | docker exec -i \
  $(docker ps -qf "label=com.docker.swarm.service.name=postgres_postgres") \
  psql -U gracie_saas -d gracie_saas
```

### Migrations

Em desenvolvimento:
```bash
# Após mudar prisma/schema.prisma:
npx prisma migrate dev --name <nome_descritivo>
# Cria prisma/migrations/<ts>_<nome>/migration.sql, aplica no DB local,
# e regenera o client.
```

Em produção, o `entrypoint.sh` roda `prisma migrate deploy` automaticamente no boot do container.
- **Fase 11:** Configurações + convites de usuário + integração Resend.
- **Deploy:** Docker + Hetzner + GitHub Actions + SSL.

## Deploy

Ainda não configurado. Será feito ao fim da Fase 12.

---

🥋 _Construído com chimarrão._

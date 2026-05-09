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

Fluxo: GitHub Actions builda a imagem → publica no GHCR → você cola o `stack.yml` no Portainer e clica deploy. Mesmo padrão dos outros stacks (Casa Roxa Gestão, Chatwoot, n8n).

### Pré-requisitos no manager

- Docker Swarm inicializado
- Network external `traefik-public` existente (mesma usada pelos outros stacks)
- Traefik com entrypoint `websecure` e certresolver `le`
- DNS `bgaf.simplificaonline.site` apontando pro IP do manager (Let's Encrypt precisa resolver pra emitir o cert)

### 1ª vez — primeiro deploy

1. **Push pro `main`** dispara o workflow `Build and push image`. Aguarde ficar verde na aba Actions (~3-5 min).

2. **Tornar imagem pública** no GHCR (uma única vez):
   - https://github.com/SEU_USER?tab=packages → clique em `gracie-saas`
   - **Package settings** (sidebar) → **Change visibility** → **Public** → confirma digitando o nome do package
   - Sem isso, o Portainer não consegue puxar a imagem

3. **Cole o `stack.yml`** no Portainer:
   - Stacks → **Add stack**
   - Name: `gracie-saas`
   - Build method: **Web editor** + cole o conteúdo de `stack.yml`
   - Em **Environment variables** preencha:
     - `POSTGRES_PASSWORD` — senha do Postgres (gere com `openssl rand -hex 24`)
     - `AUTH_SECRET` — `openssl rand -base64 32`
     - `RESEND_API_KEY` — sua chave do Resend (`re_…`)
     - `SEED_ADMIN_PASSWORD` — senha temporária do super-admin
     - `RUN_SEED_ON_BOOT=true` ← **APENAS no primeiro deploy** pra popular tenant + catálogo + super-admin
   - **Deploy the stack**

4. **Acesse** `https://bgaf.simplificaonline.site` (Let's Encrypt pode levar ~30s na primeira vez). Login com `bruno@simplificaonline.site` + a senha que colocou em `SEED_ADMIN_PASSWORD`.

5. **Edita o stack** no Portainer e troca `RUN_SEED_ON_BOOT` pra `false` (evita re-seedar em cada redeploy). Save (não precisa Re-pull).

6. Vá em `/settings/usuarios` e troque sua senha de super-admin pra uma definitiva.

### Deploys subsequentes (atualizar a app)

Workflow padrão:

1. Faça mudanças no código local, commita, push pro `main`
2. GitHub Actions builda + publica `ghcr.io/SEU_USER/gracie-saas:latest` (~3-5 min)
3. Portainer → Stacks → `gracie-saas` → Editor → marque **"Re-pull image and redeploy"** → Update the stack

Migrations Prisma rodam automaticamente no boot do container (`entrypoint.sh` chama `prisma migrate deploy`). Se você adicionou uma migration nova localmente com `npx prisma migrate dev --name ...`, ela é aplicada em prod sozinha.

### Migrations

Em desenvolvimento, após mudar `prisma/schema.prisma`:

```bash
npx prisma migrate dev --name <nome_descritivo>
```

Cria `prisma/migrations/<ts>_<nome>/migration.sql` e regenera o client. Commita o arquivo de migration junto com o código — em produção, o entrypoint roda `prisma migrate deploy` no boot.

### Backup

Não há backup automatizado configurado nesta fase. Recomendações:

- **Volume Docker**: `gracie_saas_postgres_data` no manager. Inclua nos backups regulares do servidor.
- **`pg_dump` manual** quando quiser snapshot:
  ```bash
  docker exec -t $(docker ps -qf "name=gracie-saas_postgres") \
    pg_dump -U gracie_saas gracie_saas | gzip > gracie-saas-$(date +%F).sql.gz
  ```
- **Restaurar**: `gunzip -c arquivo.sql.gz | docker exec -i ... psql -U gracie_saas gracie_saas`

---

🥋 _Construído com chimarrão._

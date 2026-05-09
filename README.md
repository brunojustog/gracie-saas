# Gracie SaaS

SaaS multi-tenant para gestão comercial de academias. Primeiro cliente: **Gracie Barra Anália Franco**. Construído pela Simplifica Online.

> **Status: Fase 3/12 — Multi-tenancy ativa.**
> Setup ✓, schema completo ✓, roteamento por subdomínio + helpers de tenant ✓.
> Próximas: RBAC (4), webhook Chatwoot (5), kanban (6), etc.

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

npm run db:push      # aplica schema sem migration file (dev)
npm run db:migrate   # cria + aplica nova migration
npm run db:deploy    # aplica migrations pendentes (produção)
npm run db:studio    # Prisma Studio
npm run db:seed      # roda prisma/seed.ts (idempotente)
npm run db:reset     # reset total + re-seed
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

## Próximas fases

- **Fase 4:** RBAC (Admin/Manager/Seller) — `requireRole(role)` já existe; falta gating de UI e Server Actions.
- **Fase 5:** Webhook Chatwoot → cria Lead.
- **Fase 6+:** Kanban, Lead detail, Aulas experimentais, Matrículas, Dashboard, Configs.
- **Deploy:** Docker + Hetzner + GitHub Actions + SSL.

## Deploy

Ainda não configurado. Será feito ao fim da Fase 12.

---

🥋 _Construído com chimarrão._

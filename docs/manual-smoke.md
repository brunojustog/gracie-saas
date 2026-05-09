# Manual smoke test — auth + multi-tenancy

Roteiro de validação manual no navegador. Existe porque a parte
"sessão real + cookie + redirect entre subdomínios" é difícil de
automatizar sem rodar e2e (Playwright) — algo que ainda não temos.

Os testes unitários (Vitest) cobrem o parser de host, builder de URL
e hierarquia de roles. Este checklist cobre o que falta: o pipeline
end-to-end com sessão.

## Pré-requisitos

```bash
docker compose up -d           # Postgres na 5433
npm run db:push && npm run db:seed
npm run dev                    # http://localhost:3000
```

Browsers modernos resolvem `*.localhost` para `127.0.0.1`
automaticamente (RFC 6761). Não precisa mexer em `/etc/hosts`.

## Cenários

| # | Persona | Ação | Resultado esperado |
|---|---|---|---|
| 1 | _anônimo_ | abrir `localhost:3000` (qualquer rota) | redireciona pra `/login` |
| 2 | super-admin Bruno | logar com `bruno@simplificaonline.site` / `gracie-2026` | cai em `/tenants` (picker) com badge "super-admin" e card "Gracie Barra" + link pro painel admin |
| 3 | super-admin Bruno | clicar em "Gracie Barra" no picker | URL muda pra `gracie.localhost:3000/dashboard`, header mostra "Gracie Barra Anália Franco", role "admin", badge "super" |
| 4 | super-admin Bruno | abrir `admin.localhost:3000/admin` | painel agregado lista o tenant Gracie com contadores users/leads/enrollments |
| 5 | seller Anna | sair, logar com `anna@gracie.com` / `gracie-2026` em `gracie.localhost:3000` | cai direto em `/dashboard` (skip do picker — Anna só tem 1 tenant), role "seller", **sem** badge super |
| 6 | seller Anna | abrir `admin.localhost:3000/admin` | redireciona pra `/tenants` (vendedora não acessa painel super) |
| 7 | seller Anna | abrir `localhost:3000` | redireciona pro picker `/tenants`, vê só Gracie (sem painel super) |

## Quando rodar

- Antes de qualquer commit que mexa em `proxy.ts`, `auth.config.ts`,
  `auth.ts`, `tenant-routing.ts`, `tenant.ts`, ou nas páginas
  `/login`, `/dashboard`, `/tenants`, `/admin`.
- Depois de upgrade do Next ou Auth.js (cookie names podem mudar).

## Próximo passo (futuro)

Quando o projeto crescer ou tivermos CI, substituir este roteiro
por Playwright. Por ora é overkill — 7 cliques manuais resolvem.

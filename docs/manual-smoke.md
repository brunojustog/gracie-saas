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

## Webhook Chatwoot (Fase 5)

O endpoint é `POST /api/webhooks/chatwoot/<slug>` e roda em rota pública (não passa pelo auth — o `proxy.ts` exclui `/api/webhooks/*`). Auth é via header `X-Chatwoot-Webhook-Secret` quando o tenant tem `chatwootWebhookSecret` configurado.

```bash
# 1. conversation_created → cria Lead novo no estágio inicial
curl -X POST http://localhost:3000/api/webhooks/chatwoot/gracie \
  -H "Content-Type: application/json" \
  -d @src/server/chatwoot/__tests__/fixtures/conversation-created.json

# Esperado: {"status":"ok","kind":"created","leadId":"..."}
# Confira em prisma studio:
#   - Lead com chatwootContactId="71", origin="WHATSAPP", stage="Novo Lead"
#   - StageHistory com nota "Lead criado via webhook do Chatwoot"
#   - WebhookLog com processed=true

# 2. mesmo evento de novo → idempotente, vira "updated" (não cria duplicata)
curl -X POST http://localhost:3000/api/webhooks/chatwoot/gracie \
  -H "Content-Type: application/json" \
  -d @src/server/chatwoot/__tests__/fixtures/conversation-created.json
# Esperado: {"status":"ok","kind":"updated","leadId":"<mesmo id>"}

# 3. contact_created (novo contato) → cria Lead
curl -X POST http://localhost:3000/api/webhooks/chatwoot/gracie \
  -H "Content-Type: application/json" \
  -d @src/server/chatwoot/__tests__/fixtures/contact-created.json
# Esperado: kind=created (origin=OTHER porque contact_created não traz channel)

# 4. message_created incoming (do contato) → atualiza lastInteractionAt
curl -X POST http://localhost:3000/api/webhooks/chatwoot/gracie \
  -H "Content-Type: application/json" \
  -d @src/server/chatwoot/__tests__/fixtures/message-created-incoming.json
# Esperado: kind=updated (lead 71 já existe da req 1)

# 5. message_created outgoing (do agente) → no-op
curl -X POST http://localhost:3000/api/webhooks/chatwoot/gracie \
  -H "Content-Type: application/json" \
  -d @src/server/chatwoot/__tests__/fixtures/message-created-outgoing.json
# Esperado: kind=skipped, reason="outgoing message (do agente)"

# 6. tenant inexistente → 404
curl -X POST http://localhost:3000/api/webhooks/chatwoot/inexistente \
  -H "Content-Type: application/json" \
  -d '{"event":"conversation_created","id":1}'
# Esperado: 404

# 7. payload inválido → 400 (sem WebhookLog criado)
curl -X POST http://localhost:3000/api/webhooks/chatwoot/gracie \
  -H "Content-Type: application/json" \
  -d 'isso não é json'
# Esperado: 400

# 8. evento desconhecido → 200 com status=logged (vai pro WebhookLog mas
#    sem chamar handler — útil pra observabilidade quando Chatwoot
#    adicionar eventos novos)
curl -X POST http://localhost:3000/api/webhooks/chatwoot/gracie \
  -H "Content-Type: application/json" \
  -d '{"event":"conversation_status_changed","id":42,"status":"resolved"}'
# Esperado: {"status":"logged","eventType":"conversation_status_changed"}
```

Pra testar com secret: setar `chatwootWebhookSecret` direto no DB (Prisma Studio) e mandar `-H "X-Chatwoot-Webhook-Secret: <valor>"`. Sem o header (ou com valor errado), retorna 401.

## Quando rodar

- Antes de qualquer commit que mexa em `proxy.ts`, `auth.config.ts`,
  `auth.ts`, `tenant-routing.ts`, `tenant.ts`, ou nas páginas
  `/login`, `/dashboard`, `/tenants`, `/admin`.
- Depois de upgrade do Next ou Auth.js (cookie names podem mudar).

## Próximo passo (futuro)

Quando o projeto crescer ou tivermos CI, substituir este roteiro
por Playwright. Por ora é overkill — 7 cliques manuais resolvem.

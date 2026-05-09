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

## Kanban (Fase 6)

Pré-requisito: `npm run db:demo-leads` (popula 20 leads distribuídos pelos stages, idempotente).

| # | Persona | Ação | Resultado esperado |
|---|---|---|---|
| 1 | super-admin Bruno | abrir `gracie.localhost:3000/kanban` | vê 11 colunas, 20 leads distribuídos, badge "20 leads" no header |
| 2 | super-admin Bruno | arrastar "Maria Silva" de "Novo Lead" → "Contatado" | card move suave, toast verde "Maria movida para Contatado", recarregar mantém estado, em `npm run db:inspect` há StageHistory novo |
| 3 | super-admin Bruno | arrastar e soltar fora de coluna | nada acontece (drag cancelado) |
| 4 | super-admin Bruno | digitar "maria" no campo de busca | só leads com "maria" no nome/telefone/email aparecem |
| 5 | super-admin Bruno | filtrar por modalidade "GBF" | só leads dessa modalidade |
| 6 | super-admin Bruno | filtrar por vendedora "Anna" | só leads atribuídos à Anna |
| 7 | seller Anna em `gracie.localhost:3000/kanban` | conta de leads visíveis | apenas os 4 leads atribuídos a `anna@gracie.com` (badge "4 leads"); filtro de vendedora **não aparece** (ela não pode filtrar) |
| 8 | seller Anna | arrastar lead da Evelyn (não vai aparecer no kanban dela mesmo) | não aplicável — leads dela não estão visíveis |
| 9 | seller Anna | tentar mover lead próprio entre stages | funciona normal (toast verde) |

Indicadores visuais no card:
- Bolinha verde: interação < 2 dias atrás
- Bolinha amarela: 2-4 dias
- Bolinha vermelha: 5+ dias (lead "frio")

## Lead detail / sheet (Fase 7)

Pré-requisito: `npm run db:demo-leads` e o kanban da Fase 6 já rodou ok.

| # | Persona | Ação | Resultado esperado |
|---|---|---|---|
| 1 | super-admin Bruno em `gracie.localhost:3000/kanban` | clicar (sem arrastar) num card | sheet lateral abre da direita; mostra spinner brevemente; depois 4 tabs (Visão geral / Histórico / Aulas / Conversas) |
| 2 | super-admin Bruno | tab Visão Geral: mudar modalidade no select | toast "Modalidade: GBF"; badge no card por trás reflete imediatamente |
| 3 | super-admin Bruno | tab Visão Geral: mudar estágio no select | toast "Movido para X"; card pula pra outra coluna sem reload (e sem fechar o sheet) |
| 4 | super-admin Bruno | tab Visão Geral: editar nome ou observações; clicar "Salvar" | toast "Dados atualizados"; card mostra novo nome |
| 5 | super-admin Bruno | tab Visão Geral: trocar vendedora no select | toast "Atribuído a Anna"; badge de vendedora no card atualiza |
| 6 | super-admin Bruno | tab Histórico | linha do tempo com bolinha colorida da cor do stage; mostra ao menos 1 entrada (criação ou movimentação) |
| 7 | super-admin Bruno | tab Aulas / tab Conversas | placeholders ("vem na fase 8" / "deep-link via /settings") |
| 8 | super-admin Bruno | clicar fora do sheet OU pressionar Esc | sheet fecha, kanban continua com mudanças aplicadas |
| 9 | super-admin Bruno | arrastar card SEM passar pelo sheet | drag funciona normal (não abre sheet) — confirma que click vs drag não conflitam |
| 10 | seller Anna em `gracie.localhost:3000/kanban` | clicar num lead próprio | sheet abre; campo "Vendedora" mostra texto plano (sem dropdown) com legenda "só admin/manager pode reatribuir" |
| 11 | seller Anna | tab Visão Geral: editar nome dos próprios leads | funciona normal |
| 12 | seller Anna | tentar acessar lead alheio via DevTools (POST /api/.../actions com leadId de outra) | servidor recusa: action retorna `{ ok: false, error: 'lead não encontrado ou sem permissão' }` (testar no DevTools Network) |

## Quando rodar

- Antes de qualquer commit que mexa em `proxy.ts`, `auth.config.ts`,
  `auth.ts`, `tenant-routing.ts`, `tenant.ts`, ou nas páginas
  `/login`, `/dashboard`, `/tenants`, `/admin`.
- Depois de upgrade do Next ou Auth.js (cookie names podem mudar).

## Próximo passo (futuro)

Quando o projeto crescer ou tivermos CI, substituir este roteiro
por Playwright. Por ora é overkill — 7 cliques manuais resolvem.

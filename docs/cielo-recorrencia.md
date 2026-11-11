# Mensalidade recorrente no cartão — Cielo (v1.3-A)

O aluno cadastra o cartão uma vez por um link, a Cielo cobra todo mês sozinha
(Recorrência Programada da API E-commerce 3.0) e a baixa entra automática na
matrícula (PaymentRecord + vencimento +1 mês, igual ao "confirmar pagamento").

## Como funciona

1. **Matrículas → ícone de cartão → "Gerar link de cadastro do cartão"**. Link
   `/p/cartao/<token>`, válido por 7 dias, de uso único. Botão pra mandar no WhatsApp.
2. Aluno preenche o cartão. Em **produção** o Silent Order Post tokeniza no
   navegador — o número do cartão vai direto pra Cielo, nunca pro nosso servidor.
3. Vencimento hoje/atrasado → cobra a 1ª mensalidade na hora. Vencimento futuro →
   agenda pro dia do vencimento. Depois repete todo mês no mesmo dia.
4. A cada cobrança a Cielo chama `POST /api/webhooks/cielo/<slug>`; o sistema
   **consulta a venda na API** (o corpo do webhook só tem IDs) e dá a baixa.
   Recusa → aparece "cartão · recusado" na matrícula e no diário do aluno.
5. Cron `GET /api/cron/cielo-reconcile` (Bearer `CRON_SECRET`) concilia tudo —
   rede de segurança se um webhook se perder. Agendar 1x/dia junto com os outros crons.

Integração com o fluxo existente:
- **Taxa de saída paga** → desativa a recorrência na Cielo automaticamente e marca
  "recorrência cancelada" (sem WhatsApp pra Gisele). Se a Cielo falhar, cai no fluxo antigo.
- **Cancelamento efetivado direto** → desativa a recorrência.
- **Valor da matrícula editado** → atualiza o valor na Cielo.
- Congelar / judicial **não** mexem na cobrança (regra atual: congelado continua pagando).

## Ativar

### Sandbox (testes)
1. Criar credenciais grátis em https://cadastrosandbox.cieloecommerce.cielo.com.br
2. Configurações → **Cobrança no cartão (Cielo)** → Ambiente "Sandbox", MerchantId, MerchantKey → Salvar → Testar.
3. No sandbox não há Silent Order Post: o cartão **de teste** é tokenizado no servidor
   (bloqueado em produção). Cartão `4111 1111 1111 1111` = aprovado; final `2` = negado.
4. `npx tsx scripts/cielo-sandbox-smoke.ts` testa o cliente contra o sandbox sem banco.

### Produção — checklist com a Cielo
- [ ] Contrato de **E-commerce Cielo** com **Recorrência Programada** habilitada → MerchantId/MerchantKey de produção.
- [ ] Credenciais do **Silent Order Post** (ClientId/ClientSecret) — site da Cielo, "Como gerar a credencial SOP".
- [ ] Pedir ao suporte pra **habilitar a tokenização no SOP** (sem isso o SOP devolve PaymentToken de uso único e a recorrência não é criada — a página avisa).
- [ ] Confirmar com a Cielo os hosts de produção do SOP (`src/server/cielo/client.ts`, `CIELO_HOSTS.production` — a doc e o exemplo oficial divergem).
- [ ] Cadastrar o **Post de Notificação** (ver "Operacional" abaixo).
- [ ] Agendar o cron `cielo-reconcile` (ver "Operacional" abaixo).
- [ ] Fazer 1 cobrança real de valor baixo e estornar pelo painel da Cielo.

## Operacional (produção — GBAF)

> **Pré-requisito:** fazer só **depois** de o PR estar na `main` e deployado (as rotas
> `/api/cron/cielo-reconcile` e `/api/webhooks/cielo/<slug>` não existem em prod antes
> do deploy) **e** de a integração estar **ligada em produção** em Configurações →
> Cobrança no cartão (ambiente "Produção", credenciais reais, Salvar — isso gera o
> `X-Cielo-Secret`). Antes disso o cron dá 404 e o webhook não tem o que validar.

Em produção o tenant do GBAF é **`bgaf`** (domínio `app.gbanaliafranco.com.br`,
alias `bgaf.simplificaonline.site`) — **não** `gracie`, que é só o slug do seed local.

### 1. Cron `cielo-reconcile` (srv-apps, `178.105.191.35`)

Rede de segurança diária: concilia toda recorrência ativa e dá baixa em mensalidade
paga que o webhook por acaso tenha perdido (idempotente). Entra no **mesmo**
`/etc/cron.d/gracie` que já roda o follow-up (*/15min) — mesmo padrão: curl com
`Authorization: Bearer <CRON_SECRET>` lido de `/etc/gracie-cron.env`, batendo no
domínio que resolve `127.0.0.1` via `/etc/hosts`, log em `/var/log/gracie-cron.log`.

Jeito mais seguro de acertar o formato: **duplicar a linha do `followup` já existente**,
trocando só o path para `/api/cron/cielo-reconcile` e o horário para 1x/dia de manhã.
Linha ilustrativa (cron.d roda em **UTC**; `10 11 * * *` ≈ 08:10 BRT):

```cron
10 11 * * * root curl -fsS -m 120 -H "Authorization: Bearer $(sed -n 's/^CRON_SECRET=//p' /etc/gracie-cron.env)" https://bgaf.simplificaonline.site/api/cron/cielo-reconcile >> /var/log/gracie-cron.log 2>&1
```

Testar na mão (deve voltar `{"ok":true,...}`):

```bash
curl -fsS -H "Authorization: Bearer $(sed -n 's/^CRON_SECRET=//p' /etc/gracie-cron.env)" https://bgaf.simplificaonline.site/api/cron/cielo-reconcile
```

### 2. Post de Notificação (webhook da Cielo)

Site da Cielo → **E-commerce → Gestão API E-commerce → Configurações → URL de
notificações**. A própria tela Configurações → Cobrança no cartão já mostra a URL e o
header prontos pra copiar (ela monta com o slug e o host certos):

- **URL:** `https://app.gbanaliafranco.com.br/api/webhooks/cielo/bgaf`
- **Header:** `X-Cielo-Secret` = valor exibido na tela (gerado ao salvar com a integração ligada).
- **Eventos a marcar:** pagamento recorrente (confirmado/negado) e alteração de status
  da recorrência — são os que disparam a baixa/atualização aqui.

O corpo do POST só traz IDs; a baixa vem da **consulta à API** (`handleCieloNotification`).
Toda notificação fica em `WebhookLog` (source `cielo`); se o processamento falhar, o
cron do item 1 concilia depois.

## Não verificado ainda
- Página do cartão no modo SOP (produção): o script da Cielo lê os campos pelas
  classes `bp-sop-*` (exemplo oficial github.com/Braspag/silent-order-post), mas
  não deu pra testar ponta a ponta sem credencial SOP + tokenização habilitada.
- Se o sandbox dispara o Post de Notificação (a doc não diz) — o cron cobre.

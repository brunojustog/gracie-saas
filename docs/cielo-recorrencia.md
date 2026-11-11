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
- [ ] Cadastrar o **Post de Notificação**: site da Cielo → E-commerce → Gestão API E-commerce → Configurações → URL de notificações. URL e header `X-Cielo-Secret` estão na tela de configuração.
- [ ] Agendar o cron `cielo-reconcile`.
- [ ] Fazer 1 cobrança real de valor baixo e estornar pelo painel da Cielo.

## Não verificado ainda
- Página do cartão no modo SOP (produção): o script da Cielo lê os campos pelas
  classes `bp-sop-*` (exemplo oficial github.com/Braspag/silent-order-post), mas
  não deu pra testar ponta a ponta sem credencial SOP + tokenização habilitada.
- Se o sandbox dispara o Post de Notificação (a doc não diz) — o cron cobre.

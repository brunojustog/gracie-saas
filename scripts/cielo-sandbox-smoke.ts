/**
 * Smoke test do cliente Cielo contra o SANDBOX (v1.3-A). Não usa banco.
 *
 *   npx tsx scripts/cielo-sandbox-smoke.ts
 *
 * Usa a loja de testes pública da documentação da Cielo por padrão; para usar
 * a sua conta de sandbox: CIELO_MERCHANT_ID=... CIELO_MERCHANT_KEY=...
 * Cartões de teste: o último dígito define o resultado (1 = aprovado, 2 = negado).
 */
import {
  type CieloCredentials,
  createRecurrence,
  deactivateRecurrence,
  getRecurrence,
  getSale,
  sandboxTokenizeCard,
  updateRecurrenceAmount,
} from "../src/server/cielo/client";

const creds: CieloCredentials = {
  environment: "sandbox",
  merchantId: process.env.CIELO_MERCHANT_ID ?? "8937bd5b-9796-494d-9fe5-f76b3e4da633",
  merchantKey: process.env.CIELO_MERCHANT_KEY ?? "XKGHUBSBKIRXKAVPSKWLVXYCLVJUGTNZLIHPUSYV",
};

function check(label: string, cond: boolean, extra?: unknown) {
  console.log(`${cond ? "OK  " : "FAIL"} ${label}${extra !== undefined ? ` — ${JSON.stringify(extra)}` : ""}`);
  if (!cond) process.exitCode = 1;
}

async function main() {
  const tk = await sandboxTokenizeCard(creds, {
    number: "4111111111111111",
    holder: "TESTE GRACIE",
    expiration: "12/2030",
    brand: "Visa",
  });
  check("tokeniza cartão de teste", tk.ok);
  if (!tk.ok) return;
  const cardToken = tk.data.CardToken;

  // 1) cobra já (vencimento hoje/atrasado)
  const now = await createRecurrence(creds, {
    merchantOrderId: `GBSMOKE${Date.now()}`,
    customerName: "Aluno Teste",
    amountCents: 25000,
    authorizeNow: true,
    cardToken,
    brand: "Visa",
    softDescriptor: "GRACIEBARRA",
  });
  check("recorrência com cobrança imediata criada", now.ok, now.ok ? undefined : now.message);
  if (now.ok) {
    check("1ª mensalidade CAPTURADA (status 2)", now.data.Payment.Status === 2, now.data.Payment.Status);
    check("devolve RecurrentPaymentId", Boolean(now.data.Payment.RecurrentPayment?.RecurrentPaymentId));
    const sale = await getSale(creds, now.data.Payment.PaymentId!);
    check("consulta da venda mostra o vínculo com a recorrência",
      sale.ok && sale.data.Payment.RecurrentPayment?.RecurrentPaymentId === now.data.Payment.RecurrentPayment?.RecurrentPaymentId);
    check("consulta da venda status 2", sale.ok && sale.data.Payment.Status === 2, sale.ok ? sale.data.Payment.Status : sale.message);
    if (sale.ok) console.log("     datas:", sale.data.Payment.ReceivedDate, sale.data.Payment.CapturedDate);
    await deactivateRecurrence(creds, now.data.Payment.RecurrentPayment!.RecurrentPaymentId);
  }

  // 2) agenda pro próximo vencimento
  const start = new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10);
  const sched = await createRecurrence(creds, {
    merchantOrderId: `GBSMOKES${Date.now()}`,
    customerName: "Aluno Teste",
    amountCents: 25000,
    authorizeNow: false,
    startDate: start,
    cardToken,
    brand: "Visa",
  });
  check("recorrência agendada (status 20)", sched.ok && sched.data.Payment.Status === 20, sched.ok ? sched.data.Payment.Status : sched.message);
  if (sched.ok) {
    const id = sched.data.Payment.RecurrentPayment!.RecurrentPaymentId;
    const amt = await updateRecurrenceAmount(creds, id, 27000);
    check("altera valor", amt.ok, amt.ok ? undefined : amt.message);
    const off = await deactivateRecurrence(creds, id);
    check("desativa", off.ok, off.ok ? undefined : off.message);
    const rec = await getRecurrence(creds, id);
    check("consulta mostra valor novo e status 3",
      rec.ok && rec.data.RecurrentPayment.Amount === 27000 && rec.data.RecurrentPayment.Status === 3,
      rec.ok ? { amount: rec.data.RecurrentPayment.Amount, status: rec.data.RecurrentPayment.Status } : rec.message);
  }

  // 3) cartão negado (final 2)
  const tk2 = await sandboxTokenizeCard(creds, { number: "4000000000000002", holder: "TESTE", expiration: "12/2030", brand: "Visa" });
  if (tk2.ok) {
    const denied = await createRecurrence(creds, {
      merchantOrderId: `GBSMOKED${Date.now()}`,
      customerName: "Aluno Teste",
      amountCents: 25000,
      authorizeNow: true,
      cardToken: tk2.data.CardToken,
      brand: "Visa",
    });
    check("cartão negado retorna status 3", denied.ok && denied.data.Payment.Status === 3,
      denied.ok ? { status: denied.data.Payment.Status, msg: denied.data.Payment.ReturnMessage, rec: denied.data.Payment.RecurrentPayment?.RecurrentPaymentId ?? null } : denied.message);
  } else {
    check("tokeniza cartão negado", false, tk2.message);
  }

  // 4) credencial errada
  const bad = await getRecurrence({ ...creds, merchantKey: "X".repeat(40) }, "00000000-0000-0000-0000-000000000000");
  check("credencial inválida é detectada", !bad.ok && (bad.status === 401 || bad.status === 403), bad.ok ? "ok?!" : bad.status);
  const good = await getRecurrence(creds, "00000000-0000-0000-0000-000000000000");
  console.log("     probe com credencial boa →", good.ok ? "200" : good.status);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

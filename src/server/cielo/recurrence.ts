/**
 * Regras de negócio da mensalidade recorrente no cartão via Cielo (v1.3-A).
 *
 * Fluxo:
 *   1. Recepção gera o link /p/cartao/<token> na matrícula e manda pro aluno.
 *   2. Aluno cadastra o cartão. Em produção o Silent Order Post tokeniza o
 *      cartão NO NAVEGADOR; chega aqui só o CardToken + bandeira + final.
 *   3. `activateRecurrence` cria a Recorrência Programada mensal na Cielo:
 *      vencimento hoje/atrasado → cobra já (AuthorizeNow); senão agenda pro
 *      próximo vencimento da matrícula.
 *   4. A cada cobrança a Cielo manda o Post de Notificação → webhook →
 *      `handleCieloNotification` consulta a venda e, se paga, dá a baixa
 *      (PaymentRecord + vencimento +1 mês — mesma regra do confirmPayment).
 *   5. O cron `cielo-reconcile` faz a mesma conciliação pela consulta da
 *      recorrência — rede de segurança se algum webhook se perder.
 *
 * Idempotência: PaymentRecord.cieloPaymentId é UNIQUE. Webhook, resposta
 * imediata e cron podem processar o mesmo pagamento sem duplicar baixa.
 */
import { Prisma } from "@prisma/client";
import { addMonths, format, startOfDay } from "date-fns";

import { prisma } from "@/lib/prisma";
import { appendLeadNote } from "@/server/lead-notes";

import {
  type CieloCredentials,
  type CieloEnvironment,
  type CieloSale,
  PAYMENT_STATUS,
  RECURRENCE_STATUS_LABEL,
  createRecurrence,
  deactivateRecurrence,
  getRecurrence,
  getSale,
} from "./client";

export const CARD_LINK_TTL_DAYS = 7;

// ──────────────────────────────────────────────────────────────────────────
// Helpers puros (cobertos por unit test)
// ──────────────────────────────────────────────────────────────────────────

export function toCents(value: Prisma.Decimal | number | string): number {
  return Math.round(Number(value) * 100);
}

/** MerchantOrderId: só [a-zA-Z0-9], máx. 50. */
export function buildMerchantOrderId(enrollmentId: string, now = new Date()): string {
  const id = `GB${enrollmentId}${now.getTime().toString(36)}`.replace(/[^a-zA-Z0-9]/g, "");
  return id.slice(0, 50);
}

/** Customer.Name: a Cielo aceita só letras/espaço. */
export function sanitizeCustomerName(name: string): string {
  const clean = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (clean || "Aluno").slice(0, 255);
}

/** SoftDescriptor (nome na fatura): alfanumérico, máx. 13. */
export function sanitizeSoftDescriptor(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  const clean = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 13);
  return clean || undefined;
}

/**
 * Quando cobrar a 1ª mensalidade: vencimento hoje, atrasado ou indefinido →
 * cobra já; vencimento futuro → agenda pra esse dia (a Cielo repete todo mês
 * no mesmo dia).
 */
export function planFirstCharge(
  nextDueDate: Date | null,
  today = new Date(),
): { authorizeNow: true } | { authorizeNow: false; startDate: string } {
  if (!nextDueDate || startOfDay(nextDueDate) <= startOfDay(today)) {
    return { authorizeNow: true };
  }
  return { authorizeNow: false, startDate: format(nextDueDate, "yyyy-MM-dd") };
}

/** "2026-11-11 09:55:00" (horário de Brasília) → Date. */
export function parseCieloDate(value: string | undefined | null): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}-03:00`);
}

export function isPaidStatus(status: number): boolean {
  return status === PAYMENT_STATUS.PaymentConfirmed;
}

export function isFailedStatus(status: number): boolean {
  return status === PAYMENT_STATUS.Denied || status === PAYMENT_STATUS.Aborted;
}

export function recurrenceLabel(status: number | null | undefined): string {
  if (status == null) return "—";
  return RECURRENCE_STATUS_LABEL[status] ?? `status ${status}`;
}

const fmtBR = (d: Date) => d.toLocaleDateString("pt-BR");

// ──────────────────────────────────────────────────────────────────────────
// Credenciais do tenant
// ──────────────────────────────────────────────────────────────────────────

export type TenantCielo = CieloCredentials & {
  tenantId: string;
  sopClientId: string | null;
  sopClientSecret: string | null;
  softDescriptor?: string;
};

export async function getTenantCielo(tenantId: string): Promise<TenantCielo | null> {
  const t = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      cieloEnvironment: true,
      cieloMerchantId: true,
      cieloMerchantKey: true,
      cieloSopClientId: true,
      cieloSopClientSecret: true,
      cieloSoftDescriptor: true,
    },
  });
  if (!t?.cieloEnvironment || !t.cieloMerchantId || !t.cieloMerchantKey) return null;
  if (t.cieloEnvironment !== "sandbox" && t.cieloEnvironment !== "production") return null;
  return {
    tenantId,
    environment: t.cieloEnvironment as CieloEnvironment,
    merchantId: t.cieloMerchantId,
    merchantKey: t.cieloMerchantKey,
    sopClientId: t.cieloSopClientId,
    sopClientSecret: t.cieloSopClientSecret,
    softDescriptor: sanitizeSoftDescriptor(t.cieloSoftDescriptor),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Baixa automática
// ──────────────────────────────────────────────────────────────────────────

type EnrollmentForPayment = {
  id: string;
  tenantId: string;
  leadId: string;
  nextDueDate: Date | null;
};

/**
 * Registra a mensalidade paga pela Cielo. Idempotente por `cieloPaymentId`:
 * devolve `false` se esse pagamento já tinha baixa.
 */
export async function recordCieloPayment(
  enrollment: EnrollmentForPayment,
  sale: CieloSale,
): Promise<boolean> {
  const paymentId = sale.Payment.PaymentId;
  if (!paymentId || !isPaidStatus(sale.Payment.Status)) return false;

  const already = await prisma.paymentRecord.findUnique({
    where: { cieloPaymentId: paymentId },
    select: { id: true },
  });
  if (already) return false;

  const paidAt =
    parseCieloDate(sale.Payment.CapturedDate) ?? parseCieloDate(sale.Payment.ReceivedDate) ?? new Date();
  const amount = (sale.Payment.CapturedAmount ?? sale.Payment.Amount) / 100;

  try {
    await prisma.$transaction(async (tx) => {
      // Relê dentro da transação: duas notificações simultâneas não podem
      // avançar o vencimento duas vezes (a 2ª esbarra no UNIQUE e faz rollback).
      const current = await tx.enrollment.findUnique({
        where: { id: enrollment.id },
        select: { nextDueDate: true },
      });
      const settledDue = current?.nextDueDate ?? null;
      const nextDue = addMonths(settledDue ?? paidAt, 1);

      const payment = await tx.paymentRecord.create({
        data: {
          tenantId: enrollment.tenantId,
          enrollmentId: enrollment.id,
          dueDate: settledDue,
          paidAt,
          amount,
          method: "CREDIT_CARD",
          cieloPaymentId: paymentId,
          notes: "Cobrança automática Cielo (recorrência)",
        },
      });
      await tx.enrollment.update({
        where: { id: enrollment.id },
        data: { nextDueDate: nextDue, cieloLastError: null, cieloSyncedAt: new Date() },
      });
      await appendLeadNote(
        {
          tenantId: enrollment.tenantId,
          leadId: enrollment.leadId,
          kind: "PAYMENT_CONFIRMED",
          body: settledDue
            ? `Mensalidade paga no cartão (Cielo, venc. ${fmtBR(settledDue)}) — próximo vencimento ${fmtBR(nextDue)}`
            : `Mensalidade paga no cartão (Cielo) — próximo vencimento ${fmtBR(nextDue)}`,
          metadata: {
            enrollmentId: enrollment.id,
            paymentRecordId: payment.id,
            cieloPaymentId: paymentId,
            paidAt: paidAt.toISOString(),
            nextDueDate: nextDue.toISOString(),
          },
        },
        tx,
      );
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
  return true;
}

/** Cobrança recusada: guarda o motivo e escreve no diário (uma vez por pagamento). */
async function recordCieloFailure(enrollment: EnrollmentForPayment, sale: CieloSale): Promise<void> {
  const reason = sale.Payment.ReturnMessage ?? `status ${sale.Payment.Status}`;
  const when = parseCieloDate(sale.Payment.ReceivedDate) ?? new Date();
  const message = `Cobrança recusada em ${fmtBR(when)}: ${reason}`;

  const existing = await prisma.enrollment.findUnique({
    where: { id: enrollment.id },
    select: { cieloLastError: true },
  });
  if (existing?.cieloLastError === message) return;

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { cieloLastError: message, cieloSyncedAt: new Date() },
  });
  await appendLeadNote({
    tenantId: enrollment.tenantId,
    leadId: enrollment.leadId,
    kind: "CIELO_EVENT",
    body: `${message}. A Cielo tenta de novo automaticamente; se persistir, peça outro cartão ao aluno.`,
    metadata: { enrollmentId: enrollment.id, cieloPaymentId: sale.Payment.PaymentId ?? null, step: "charge_denied" },
  });
}

/** Consulta a venda na Cielo e aplica o resultado (baixa ou recusa). */
export async function syncCieloPayment(
  cielo: TenantCielo,
  paymentId: string,
): Promise<"paid" | "already" | "failed" | "ignored" | "not_found"> {
  const res = await getSale(cielo, paymentId);
  if (!res.ok) throw new Error(`consulta da venda ${paymentId}: ${res.message}`);
  const sale = res.data;
  const recurrentId = sale.Payment.RecurrentPayment?.RecurrentPaymentId;
  if (!recurrentId) return "ignored"; // venda avulsa, não é mensalidade

  const enrollment = await prisma.enrollment.findFirst({
    where: { tenantId: cielo.tenantId, cieloRecurrentPaymentId: recurrentId },
    select: { id: true, tenantId: true, leadId: true, nextDueDate: true },
  });
  if (!enrollment) return "not_found";

  if (isPaidStatus(sale.Payment.Status)) {
    return (await recordCieloPayment(enrollment, sale)) ? "paid" : "already";
  }
  if (isFailedStatus(sale.Payment.Status)) {
    await recordCieloFailure(enrollment, sale);
    return "failed";
  }
  return "ignored";
}

/**
 * Atualiza o status da recorrência e concilia as cobranças dela (últimos 3
 * meses, limite da API de consulta).
 */
export async function syncCieloRecurrence(
  cielo: TenantCielo,
  enrollmentId: string,
): Promise<{ status: number; paid: number }> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, tenantId: true, leadId: true, cieloRecurrentPaymentId: true, cieloRecurrenceStatus: true },
  });
  if (!enrollment?.cieloRecurrentPaymentId || enrollment.tenantId !== cielo.tenantId) {
    throw new Error("matrícula sem recorrência Cielo");
  }

  const res = await getRecurrence(cielo, enrollment.cieloRecurrentPaymentId);
  if (!res.ok) throw new Error(`consulta da recorrência: ${res.message}`);
  const rec = res.data.RecurrentPayment;

  if (rec.Status !== enrollment.cieloRecurrenceStatus) {
    await prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { cieloRecurrenceStatus: rec.Status, cieloSyncedAt: new Date() },
    });
    if (rec.Status !== 1) {
      await appendLeadNote({
        tenantId: enrollment.tenantId,
        leadId: enrollment.leadId,
        kind: "CIELO_EVENT",
        body: `Recorrência no cartão (Cielo) ${recurrenceLabel(rec.Status)}.`,
        metadata: { enrollmentId: enrollment.id, recurrenceStatus: rec.Status, step: "recurrence_status" },
      });
    }
  } else {
    await prisma.enrollment.update({ where: { id: enrollment.id }, data: { cieloSyncedAt: new Date() } });
  }

  let paid = 0;
  const known = new Set(
    (
      await prisma.paymentRecord.findMany({
        where: { enrollmentId: enrollment.id, cieloPaymentId: { not: null } },
        select: { cieloPaymentId: true },
      })
    ).map((p) => p.cieloPaymentId),
  );
  for (const t of rec.RecurrentTransactions ?? []) {
    if (!t.PaymentId || known.has(t.PaymentId)) continue;
    if ((await syncCieloPayment(cielo, t.PaymentId)) === "paid") paid++;
  }
  return { status: rec.Status, paid };
}

// ──────────────────────────────────────────────────────────────────────────
// Post de Notificação (webhook)
// ──────────────────────────────────────────────────────────────────────────

export type CieloNotification = {
  PaymentId?: string;
  RecurrentPaymentId?: string;
  ChangeType?: number;
};

/**
 * ChangeType 1 (status do pagamento) / 2 (recorrência criada) / 25
 * (cancelamento) → consulta a venda. 4 (status da recorrência) → consulta a
 * recorrência. O payload só traz IDs: a verdade SEMPRE vem da consulta à API,
 * então um POST forjado não consegue dar baixa falsa.
 */
export async function handleCieloNotification(
  cielo: TenantCielo,
  n: CieloNotification,
): Promise<string> {
  if (n.ChangeType === 4 && n.RecurrentPaymentId) {
    const enrollment = await prisma.enrollment.findFirst({
      where: { tenantId: cielo.tenantId, cieloRecurrentPaymentId: n.RecurrentPaymentId },
      select: { id: true },
    });
    if (!enrollment) return "recorrência desconhecida";
    const r = await syncCieloRecurrence(cielo, enrollment.id);
    return `recorrência status ${r.status}`;
  }
  if (n.PaymentId && (n.ChangeType === 1 || n.ChangeType === 2 || n.ChangeType === 25 || n.ChangeType == null)) {
    return syncCieloPayment(cielo, n.PaymentId);
  }
  return "evento ignorado";
}

// ──────────────────────────────────────────────────────────────────────────
// Ativar / desativar
// ──────────────────────────────────────────────────────────────────────────

export type ActivateInput = {
  enrollmentId: string;
  cardToken: string;
  brand: string;
  last4: string;
};

export type ActivateResult =
  | { ok: true; chargedNow: boolean; paid: boolean; startDate?: string }
  | { ok: false; error: string };

export async function activateRecurrence(
  cielo: TenantCielo,
  input: ActivateInput,
): Promise<ActivateResult> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: input.enrollmentId },
    select: {
      id: true,
      tenantId: true,
      leadId: true,
      status: true,
      monthlyValue: true,
      nextDueDate: true,
      cieloRecurrentPaymentId: true,
      cieloRecurrenceStatus: true,
      lead: { select: { name: true, payerName: true } },
    },
  });
  if (!enrollment || enrollment.tenantId !== cielo.tenantId) return { ok: false, error: "matrícula não encontrada" };
  if (enrollment.status !== "ACTIVE") return { ok: false, error: "matrícula não está ativa" };
  if (enrollment.cieloRecurrentPaymentId && enrollment.cieloRecurrenceStatus === 1) {
    return { ok: false, error: "esta matrícula já tem cobrança automática ativa" };
  }
  const amountCents = toCents(enrollment.monthlyValue);
  if (amountCents <= 0) return { ok: false, error: "matrícula sem valor de mensalidade" };

  const plan = planFirstCharge(enrollment.nextDueDate);
  const res = await createRecurrence(cielo, {
    merchantOrderId: buildMerchantOrderId(enrollment.id),
    customerName: sanitizeCustomerName(enrollment.lead.payerName || enrollment.lead.name),
    amountCents,
    authorizeNow: plan.authorizeNow,
    startDate: plan.authorizeNow ? undefined : plan.startDate,
    cardToken: input.cardToken,
    brand: input.brand,
    softDescriptor: cielo.softDescriptor,
  });
  if (!res.ok) return { ok: false, error: `Cielo recusou: ${res.message}` };

  const sale = res.data;
  const recurrentId = sale.Payment.RecurrentPayment?.RecurrentPaymentId;
  // Cobrança imediata recusada: pede outro cartão. Se a Cielo chegou a criar
  // a recorrência, desativa — senão ela ficaria órfã tentando cobrar sozinha.
  if (plan.authorizeNow && !isPaidStatus(sale.Payment.Status) && sale.Payment.Status !== PAYMENT_STATUS.Authorized) {
    if (recurrentId) await deactivateRecurrence(cielo, recurrentId).catch(() => undefined);
    return { ok: false, error: `cartão recusado: ${sale.Payment.ReturnMessage ?? "tente outro cartão"}` };
  }
  if (!recurrentId) return { ok: false, error: "a Cielo não devolveu a recorrência — tente novamente" };

  // Se a matrícula tinha uma recorrência antiga (cartão trocado), desativa.
  if (enrollment.cieloRecurrentPaymentId && enrollment.cieloRecurrentPaymentId !== recurrentId) {
    await deactivateRecurrence(cielo, enrollment.cieloRecurrentPaymentId).catch(() => undefined);
  }

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: {
      cieloRecurrentPaymentId: recurrentId,
      cieloRecurrenceStatus: 1,
      cieloCardBrand: input.brand,
      cieloCardMasked: `final ${input.last4}`,
      cieloCardLinkToken: null,
      cieloCardLinkExpiresAt: null,
      cieloLastError: null,
      cieloSyncedAt: new Date(),
      paymentMethod: "CREDIT_CARD",
    },
  });
  await appendLeadNote({
    tenantId: enrollment.tenantId,
    leadId: enrollment.leadId,
    kind: "CIELO_EVENT",
    body: plan.authorizeNow
      ? `Cartão ${input.brand} final ${input.last4} cadastrado — cobrança automática mensal ativada (1ª mensalidade cobrada agora).`
      : `Cartão ${input.brand} final ${input.last4} cadastrado — cobrança automática mensal a partir de ${plan.startDate.split("-").reverse().join("/")}.`,
    metadata: { enrollmentId: enrollment.id, recurrentPaymentId: recurrentId, step: "recurrence_created" },
  });

  let paid = false;
  if (plan.authorizeNow) {
    paid = await recordCieloPayment(
      { id: enrollment.id, tenantId: enrollment.tenantId, leadId: enrollment.leadId, nextDueDate: enrollment.nextDueDate },
      sale,
    );
  }
  return plan.authorizeNow
    ? { ok: true, chargedNow: true, paid }
    : { ok: true, chargedNow: false, paid: false, startDate: plan.startDate };
}

/**
 * Desativa a recorrência na Cielo (para de cobrar). Usado no cancelamento da
 * matrícula — substitui o passo manual da Gisele no banco.
 */
export async function deactivateEnrollmentRecurrence(
  tenantId: string,
  enrollmentId: string,
  opts: { authorId?: string | null; reason: string },
): Promise<{ ok: true; deactivated: boolean } | { ok: false; error: string }> {
  const enrollment = await prisma.enrollment.findUnique({
    where: { id: enrollmentId },
    select: { id: true, tenantId: true, leadId: true, cieloRecurrentPaymentId: true, cieloRecurrenceStatus: true },
  });
  if (!enrollment || enrollment.tenantId !== tenantId) return { ok: false, error: "matrícula não encontrada" };
  if (!enrollment.cieloRecurrentPaymentId || enrollment.cieloRecurrenceStatus !== 1) {
    return { ok: true, deactivated: false };
  }
  const cielo = await getTenantCielo(tenantId);
  if (!cielo) return { ok: false, error: "integração Cielo não configurada" };

  const res = await deactivateRecurrence(cielo, enrollment.cieloRecurrentPaymentId);
  if (!res.ok) return { ok: false, error: `Cielo: ${res.message}` };

  await prisma.enrollment.update({
    where: { id: enrollment.id },
    data: { cieloRecurrenceStatus: 3, cieloSyncedAt: new Date() },
  });
  await appendLeadNote({
    tenantId,
    leadId: enrollment.leadId,
    authorId: opts.authorId ?? null,
    kind: "CIELO_EVENT",
    body: `Cobrança automática no cartão (Cielo) desativada — ${opts.reason}.`,
    metadata: { enrollmentId: enrollment.id, step: "recurrence_deactivated" },
  });
  return { ok: true, deactivated: true };
}

/** Cron: concilia todas as recorrências ativas de todos os tenants. */
export async function reconcileAllCielo(): Promise<{ checked: number; paid: number; errors: number }> {
  const tenants = await prisma.tenant.findMany({
    where: { active: true, cieloEnvironment: { not: null }, cieloMerchantId: { not: null } },
    select: { id: true },
  });
  let checked = 0;
  let paid = 0;
  let errors = 0;
  for (const t of tenants) {
    const cielo = await getTenantCielo(t.id);
    if (!cielo) continue;
    const enrollments = await prisma.enrollment.findMany({
      where: { tenantId: t.id, cieloRecurrentPaymentId: { not: null }, cieloRecurrenceStatus: 1 },
      select: { id: true },
    });
    for (const e of enrollments) {
      checked++;
      try {
        paid += (await syncCieloRecurrence(cielo, e.id)).paid;
      } catch (err) {
        errors++;
        console.error("[cielo/reconcile]", e.id, err);
      }
    }
  }
  return { checked, paid, errors };
}

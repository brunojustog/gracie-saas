/**
 * Rótulos PT-BR das formas de pagamento (fonte única). v1.2-BX.
 * Client-safe (sem Prisma) — usado em telas de financeiro, graduação e lojinha.
 */
import type { PaymentMethod } from "@prisma/client";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  PIX: "Pix",
  CREDIT_CARD: "Cartão",
  BOLETO: "Boleto",
  CASH: "Dinheiro",
  TRANSFER: "Transferência",
  OTHER: "Outro",
};

/** Ordem canônica pra exibir consolidados/opções. */
export const PAYMENT_METHOD_ORDER: PaymentMethod[] = [
  "PIX",
  "CREDIT_CARD",
  "CASH",
  "BOLETO",
  "TRANSFER",
  "OTHER",
];

export function paymentMethodLabel(m: PaymentMethod | null | undefined): string {
  return m ? PAYMENT_METHOD_LABELS[m] : "—";
}

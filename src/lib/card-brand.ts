/**
 * v1.3-A: detecção da bandeira pelo número do cartão (BIN). Roda no NAVEGADOR
 * na página de cadastro do cartão — o número nunca vai pro nosso servidor,
 * só a bandeira + o token devolvido pelo Silent Order Post da Cielo.
 *
 * Nomes de bandeira no formato aceito pela Cielo (campo CreditCard.Brand).
 * Ordem importa: Elo e Hipercard têm faixas que colidem com Visa/Master.
 */
export type CieloBrand = "Visa" | "Master" | "Amex" | "Elo" | "Hipercard" | "Diners" | "Discover" | "JCB";

const ELO_PREFIXES = [
  "401178", "401179", "431274", "438935", "451416", "457393", "457631", "457632",
  "504175", "506699", "506770", "506771", "506772", "506773", "506774", "506775",
  "506776", "506777", "506778", "509", "627780", "636297", "636368", "650", "651",
  "652", "655",
];

export function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function detectCardBrand(cardNumber: string): CieloBrand | null {
  const n = onlyDigits(cardNumber);
  if (n.length < 4) return null;
  if (ELO_PREFIXES.some((p) => n.startsWith(p))) return "Elo";
  if (/^(606282|3841)/.test(n)) return "Hipercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^3(0[0-5]|[68])/.test(n)) return "Diners";
  if (/^35(2[89]|[3-8])/.test(n)) return "JCB";
  if (/^(6011|65|64[4-9])/.test(n)) return "Discover";
  if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return "Master";
  if (/^4/.test(n)) return "Visa";
  return null;
}

/** Algoritmo de Luhn (mod 10) — validação local antes de mandar pra Cielo. */
export function isLuhnValid(cardNumber: string): boolean {
  const n = onlyDigits(cardNumber);
  if (n.length < 12 || n.length > 19) return false;
  let sum = 0;
  let double = false;
  for (let i = n.length - 1; i >= 0; i--) {
    let d = Number(n[i]);
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

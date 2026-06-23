/**
 * Helpers de data (v1.1-BA).
 *
 * PROBLEMA: `new Date("2026-06-25")` é interpretado como meia-noite **UTC**.
 * No Brasil (UTC-3) isso vira 2026-06-24 21:00 — ou seja, ao salvar/exibir
 * datas "só dia" (sem hora) o sistema marcava sempre o dia anterior.
 *
 * SOLUÇÃO: interpretar a string "YYYY-MM-DD" no fuso LOCAL, ancorando ao
 * meio-dia. Meio-dia dá folga de 12h pra qualquer offset/DST, então a data
 * exibida (toLocaleDateString / date-fns format) bate sempre com a digitada.
 */

/** Converte "YYYY-MM-DD" numa Date local ao meio-dia. Inválida → null. */
export function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const [, y, mo, d] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), 12, 0, 0, 0);
}

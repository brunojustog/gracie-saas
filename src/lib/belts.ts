/**
 * Faixas de Jiu-Jitsu (graduação) — v1.1-AL. Puro/client-safe, reutilizado
 * nos selects de lead, matrícula e aula particular pra padronizar os dados.
 */
export const ADULT_BELTS = ["Branca", "Azul", "Roxa", "Marrom", "Preta", "Coral", "Vermelha"] as const;
export const KIDS_BELTS = ["Cinza", "Amarela", "Laranja", "Verde"] as const;

/** Lista completa pra dropdown (adulto + kids). */
export const ALL_BELTS = [...ADULT_BELTS, ...KIDS_BELTS] as const;

/** Graus possíveis numa faixa (0 a 4). */
export const BELT_DEGREES = [0, 1, 2, 3, 4] as const;

/** "Azul" / "Azul · 2º grau" / "—" quando sem faixa. */
export function formatBelt(
  belt: string | null | undefined,
  degree: number | null | undefined,
): string {
  if (!belt) return "—";
  if (degree && degree > 0) return `${belt} · ${degree}º grau`;
  return belt;
}

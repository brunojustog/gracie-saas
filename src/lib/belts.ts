/**
 * Faixas de Jiu-Jitsu (graduação) — v1.1-AL, ampliado no v1.2-W.
 * Puro/client-safe, reutilizado nos selects de lead, matrícula, aula
 * particular, graduação e edição de aluno pra padronizar os dados.
 */
export const ADULT_BELTS = ["Branca", "Azul", "Roxa", "Marrom", "Preta", "Coral", "Vermelha"] as const;

/**
 * GBK (kids) — sistema de graduação completo da Gracie Barra, com as faixas
 * intermediárias bicolores (e Branca / e Preta). Ordem = progressão real.
 */
export const KIDS_BELTS = [
  "Branca",
  "Cinza e Branca", "Cinza", "Cinza e Preta",
  "Amarela e Branca", "Amarela", "Amarela e Preta",
  "Laranja e Branca", "Laranja", "Laranja e Preta",
  "Verde e Branca", "Verde", "Verde e Preta",
] as const;

/** Lista completa pra dropdown (adulto + kids, sem duplicar "Branca"). */
export const ALL_BELTS: string[] = Array.from(new Set([...ADULT_BELTS, ...KIDS_BELTS]));

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

/**
 * Ordenação por graduação (kids → adulto), usada pra ordenar listas de alunos
 * por faixa. As variações kids entram entre a branca e as coloridas adultas.
 */
const RANK_ORDER = [
  "Branca",
  "Cinza e Branca", "Cinza", "Cinza e Preta",
  "Amarela e Branca", "Amarela", "Amarela e Preta",
  "Laranja e Branca", "Laranja", "Laranja e Preta",
  "Verde e Branca", "Verde", "Verde e Preta",
  "Azul", "Roxa", "Marrom", "Preta", "Coral", "Vermelha",
];
export const BELT_RANK: Record<string, number> = Object.fromEntries(
  RANK_ORDER.map((b, i) => [b.toLowerCase(), i]),
);
export const beltRank = (belt: string | null | undefined): number =>
  belt ? BELT_RANK[belt.toLowerCase()] ?? -1 : -1;

/** Cores absolutas de cada faixa (hex — independem do tema). */
const BELT_HEX: Record<string, string> = {
  branca: "#e8e8ea", cinza: "#6b7280", amarela: "#f2c200", laranja: "#f2760c",
  verde: "#1c9e4b", azul: "#1f5fd0", roxa: "#7b2fd6", marrom: "#5a3410",
  preta: "#141414", coral: "#e2534c", vermelha: "#c81d25",
};

function baseHex(s: string): string {
  if (s.startsWith("branca")) return BELT_HEX.branca;
  if (s.startsWith("cinza")) return BELT_HEX.cinza;
  if (s.startsWith("amarela")) return BELT_HEX.amarela;
  if (s.startsWith("laranja")) return BELT_HEX.laranja;
  if (s.startsWith("verde")) return BELT_HEX.verde;
  if (s.startsWith("azul")) return BELT_HEX.azul;
  if (s.startsWith("roxa")) return BELT_HEX.roxa;
  if (s.startsWith("marrom")) return BELT_HEX.marrom;
  if (s.startsWith("preta")) return BELT_HEX.preta;
  if (s.startsWith("coral")) return BELT_HEX.coral;
  if (s.startsWith("vermelha")) return BELT_HEX.vermelha;
  return BELT_HEX.cinza;
}

/**
 * Estilo de "swatch" da faixa. Faixas bicolores (kids "… e Branca / e Preta")
 * viram um degradê com uma barra central da 2ª cor — como a ponta da faixa real.
 */
export function beltStyle(belt: string | null | undefined): { background: string } {
  if (!belt) return { background: BELT_HEX.cinza };
  const s = belt.toLowerCase();
  const base = baseHex(s);
  const second = s.includes("e branca")
    ? BELT_HEX.branca
    : s.includes("e preta")
      ? BELT_HEX.preta
      : null;
  if (second) {
    return {
      background: `linear-gradient(90deg, ${base} 0 38%, ${second} 38% 62%, ${base} 62% 100%)`,
    };
  }
  return { background: base };
}

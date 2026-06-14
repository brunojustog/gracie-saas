/**
 * Palpite de gênero pelo primeiro nome (pt-BR) — v1.1-AK.
 *
 * Puro, sem Prisma — usado pra pré-selecionar o gênero ao criar lead novo
 * (a vendedora confirma/corrige). A MESMA heurística roda como SQL no
 * backfill da migration v24 pros leads já existentes.
 *
 * É só um chute pra agilizar o preenchimento — NÃO é fonte de verdade.
 * Regra: primeiro nome terminando em "a" → feminino (salvo exceções
 * masculinas conhecidas), mais uma lista de nomes femininos que não
 * terminam em "a". O resto → masculino.
 */
export type GenderGuess = "FEMALE" | "MALE";

/** Femininos comuns que NÃO terminam em "a". */
const FEMALE_NOT_A = new Set([
  "raquel", "isabel", "beatriz", "ines", "inês", "karen", "ester", "esther",
  "rute", "ruth", "eliane", "cristiane", "adriane", "daniele", "danielle",
  "michele", "michelle", "eveline", "evelyn", "heloise", "heloíse",
  "elizabeth", "jaqueline", "jacqueline", "caroline", "isabelle", "gabrielle",
  "emanuelle", "marianne", "mariane", "luane", "luanne", "nicole",
]);

/** Masculinos comuns que terminam em "a" (raros, mas existem). */
const MALE_ENDS_A = new Set(["luca", "josua", "joshua", "elia", "aja"]);

/**
 * Retorna o palpite, ou null quando o nome é vazio/ininteligível (deixa o
 * usuário escolher). Nunca lança.
 */
export function guessGender(name: string | null | undefined): GenderGuess | null {
  if (!name) return null;
  const first = name.trim().toLowerCase().split(/\s+/)[0] ?? "";
  if (first === "") return null;
  if (FEMALE_NOT_A.has(first)) return "FEMALE";
  if (first.endsWith("a") && !MALE_ENDS_A.has(first)) return "FEMALE";
  return "MALE";
}

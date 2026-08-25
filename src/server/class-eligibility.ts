/**
 * v1.2-J: filtro de aula por perfil do aluno (regras do Anderson, 21/08).
 *
 *  GB1        → adulto faixa branca até 2º grau (iniciante) — GB2 também pode
 *  GB2        → adulto faixa branca 3º grau pra cima / faixas coloridas
 *  NOGI       → só GB2 (branca 3º+)
 *  GBK PC     → crianças 3–10
 *  GBK JUV    → juniores 11–15
 *  GBF        → mulheres 15+
 *
 * Cortes: adulto = 16+. Idade desconhecida → tratado como adulto (mostra as
 * aulas adultas por faixa; esconde as que dependem de idade exata: PC/JUV).
 * Puro (sem Prisma) — testável e usável em qualquer camada.
 */
export type ClassCategory = "GB1" | "GB2" | "NOGI" | "GBK_PC" | "GBK_JUV" | "GBF" | "OTHER";

export type AlunoProfile = {
  belt: string | null;
  grau: number;
  age: number | null;
  gender: "MALE" | "FEMALE" | null;
};

const COLORED_ADULT = new Set(["azul", "roxa", "marrom", "preta", "coral", "vermelha"]);

/** Nível amigável da aula (pra exibir na grade do aluno). */
export function nivelLabel(label: string): string {
  switch (classCategory(label)) {
    case "GB1": return "Iniciante";
    case "GB2": return "Avançado";
    case "NOGI": return "No-Gi";
    case "GBK_PC": return "Kids 3–10";
    case "GBK_JUV": return "Kids 11–15";
    case "GBF": return "Feminino";
    default: return "Todos os níveis";
  }
}

/** Categoriza a aula pelo nome (padronizado na grade da academia). */
export function classCategory(label: string): ClassCategory {
  const s = label.toLowerCase();
  if (s.includes("nogi")) return "NOGI";
  if (s.includes("gbf")) return "GBF";
  if (s.includes("junior")) return "GBK_JUV";
  if (s.includes("pequeno") || /\bpc ?\d?\b/.test(s) || s.includes("gbk") || s.includes("kids"))
    return "GBK_PC";
  if (s.includes("gb2")) return "GB2";
  if (s.includes("gb1")) return "GB1";
  return "OTHER";
}

/** Idade em anos a partir da data de nascimento (null se não informada). */
export function ageFromBirth(birth: Date | null | undefined, now: Date): number | null {
  if (!birth) return null;
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age;
}

function isGB2(p: AlunoProfile): boolean {
  const adult = p.age == null || p.age >= 16;
  if (!adult) return false;
  const b = (p.belt ?? "").toLowerCase();
  if (b === "branca") return p.grau >= 3;
  return COLORED_ADULT.has(b);
}

/** O aluno pode ver/fazer essa aula? */
export function canAttend(p: AlunoProfile, label: string): boolean {
  const adult = p.age == null || p.age >= 16;
  switch (classCategory(label)) {
    case "GB1":
      return adult;
    case "GB2":
    case "NOGI":
      return isGB2(p);
    case "GBK_PC":
      return p.age != null && p.age >= 3 && p.age <= 10;
    case "GBK_JUV":
      return p.age != null && p.age >= 11 && p.age <= 15;
    case "GBF":
      return p.gender === "FEMALE" && (p.age == null || p.age >= 15);
    default:
      return true;
  }
}

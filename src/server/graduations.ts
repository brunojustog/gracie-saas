/**
 * v1.2-C (Etapa 2): graduação assistida.
 *
 * O sistema SUGERE a próxima graduação (pela sequência de faixas) e mostra
 * quantas presenças confirmadas o aluno tem desde a última graduação — mas
 * quem gradua é sempre o professor. Nunca automático.
 */
import { prisma } from "@/lib/prisma";

/** Presenças confirmadas que sugerem uma nova graduação (default, ajustável). */
export const AULAS_POR_GRADUACAO = 40;

const ADULT = ["Branca", "Azul", "Roxa", "Marrom", "Preta"];
// GBK (kids): sequência completa com as faixas intermediárias bicolores.
const KIDS = [
  "Branca",
  "Cinza e Branca", "Cinza", "Cinza e Preta",
  "Amarela e Branca", "Amarela", "Amarela e Preta",
  "Laranja e Branca", "Laranja", "Laranja e Preta",
  "Verde e Branca", "Verde", "Verde e Preta",
];

function maxGrau(belt: string): number {
  return belt.trim().toLowerCase() === "preta" ? 6 : 4;
}

/** Próxima graduação sugerida a partir da faixa/grau atual (null = desconhecida). */
export function nextGraduation(
  belt: string | null,
  grau: number | null,
): { belt: string; beltDegree: number } | null {
  if (!belt) return null;
  const b = belt.trim();
  const g = grau ?? 0;
  for (const seq of [ADULT, KIDS]) {
    const i = seq.findIndex((x) => x.toLowerCase() === b.toLowerCase());
    if (i >= 0) {
      if (g < maxGrau(b)) return { belt: b, beltDegree: g + 1 };
      if (i < seq.length - 1) return { belt: seq[i + 1], beltDegree: 0 };
      return { belt: b, beltDegree: g }; // já no topo
    }
  }
  return null;
}

/** Conta presenças confirmadas do aluno depois de uma data (ou todas). */
async function countPresence(alunoId: string, since: Date | null): Promise<number> {
  return prisma.checkIn.count({
    where: {
      alunoId,
      present: true,
      ...(since ? { session: { date: { gt: since } } } : {}),
    },
  });
}

export type GradListRow = {
  alunoId: string;
  nome: string;
  matricula: string | null;
  belt: string | null;
  beltDegree: number | null;
  presencas: number;
  disponivel: boolean;
  next: { belt: string; beltDegree: number } | null;
};

/** Lista de alunos pro professor graduar (com presenças + sugestão). */
export async function getGraduationList(tenantId: string): Promise<GradListRow[]> {
  const alunos = await prisma.aluno.findMany({
    where: { tenantId, active: true },
    select: {
      id: true,
      matricula: true,
      lastGraduationAt: true,
      lead: { select: { name: true, belt: true, beltDegree: true } },
    },
  });

  const rows = await Promise.all(
    alunos.map(async (a) => {
      const presencas = await countPresence(a.id, a.lastGraduationAt);
      return {
        alunoId: a.id,
        nome: a.lead.name,
        matricula: a.matricula,
        belt: a.lead.belt,
        beltDegree: a.lead.beltDegree,
        presencas,
        disponivel: presencas >= AULAS_POR_GRADUACAO,
        next: nextGraduation(a.lead.belt, a.lead.beltDegree),
      };
    }),
  );
  // Disponíveis primeiro, depois por presenças.
  return rows.sort(
    (a, b) =>
      Number(b.disponivel) - Number(a.disponivel) || b.presencas - a.presencas,
  );
}

/**
 * IDs dos alunos que já atingiram o gatilho de graduação — usado pra sinalizar
 * "pode graduar" no check-in do professor (chamada). v1.2-X.
 */
export async function getAvailableGraduationAlunoIds(
  tenantId: string,
): Promise<string[]> {
  const rows = await getGraduationList(tenantId);
  return rows.filter((r) => r.disponivel).map((r) => r.alunoId);
}

export type ProfessorGradHistory = {
  id: string;
  alunoNome: string;
  belt: string;
  beltDegree: number;
  graduatedAt: Date;
};

/**
 * Painel de graduações do professor (v1.2-X): quantos alunos estão prontos
 * pra graduar (pendentes) + histórico das graduações que ELE já fez.
 */
export async function getProfessorGraduationPanel(
  tenantId: string,
  professorId: string,
): Promise<{ pendingCount: number; history: ProfessorGradHistory[] }> {
  const [available, history] = await Promise.all([
    getAvailableGraduationAlunoIds(tenantId),
    prisma.graduation.findMany({
      where: { tenantId, professorId },
      orderBy: { graduatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        belt: true,
        beltDegree: true,
        graduatedAt: true,
        aluno: { select: { lead: { select: { name: true } } } },
      },
    }),
  ]);
  return {
    pendingCount: available.length,
    history: history.map((h) => ({
      id: h.id,
      alunoNome: h.aluno.lead.name,
      belt: h.belt,
      beltDegree: h.beltDegree,
      graduatedAt: h.graduatedAt,
    })),
  };
}

export type TimelineItem = {
  id: string;
  belt: string;
  beltDegree: number;
  graduatedAt: Date;
  note: string | null;
  professorName: string | null;
  hasPhoto: boolean;
};

/** Linha do tempo de graduações do aluno (mais recente primeiro). */
export async function getAlunoTimeline(
  tenantId: string,
  alunoId: string,
): Promise<TimelineItem[]> {
  const rows = await prisma.graduation.findMany({
    where: { tenantId, alunoId },
    orderBy: { graduatedAt: "desc" },
    select: {
      id: true,
      belt: true,
      beltDegree: true,
      graduatedAt: true,
      note: true,
      photoMime: true,
      professor: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    belt: r.belt,
    beltDegree: r.beltDegree,
    graduatedAt: r.graduatedAt,
    note: r.note,
    professorName: r.professor?.name ?? null,
    hasPhoto: r.photoMime != null,
  }));
}

/** Progresso do aluno rumo à próxima graduação (barra na tela dele). */
export async function getAlunoProgress(alunoId: string, since: Date | null) {
  const presencas = await countPresence(alunoId, since);
  const pct = Math.min(100, Math.round((presencas / AULAS_POR_GRADUACAO) * 100));
  return { presencas, threshold: AULAS_POR_GRADUACAO, pct };
}

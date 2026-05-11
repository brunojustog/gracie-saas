/**
 * Templates da Etapa 1 (Novo Lead) do Playbook Comercial.
 *
 * 8 mensagens em 7 dias. Placeholders: {nome}, {atendente}, {academia}.
 *
 * Quando criar v1.2/Phase E, adicionar templates pras outras etapas
 * (Agendamento, Comparecimento, Negociação) em arquivo separado por etapa.
 */

export type FollowUpTemplate = {
  step: number;
  /** Etiqueta interna (log/admin); não vai pro cliente. */
  label: string;
  body: string;
};

export const NOVO_LEAD_TEMPLATES: ReadonlyArray<FollowUpTemplate> = [
  {
    step: 1,
    label: "Boas-vindas",
    body:
      "Oi {nome}, tudo bem? Aqui é a {atendente} da {academia}.\n" +
      "Vi seu interesse e estou passando para te ajudar.\n" +
      "Me fala uma coisa: você está buscando aula para você ou para outra pessoa?",
  },
  {
    step: 2,
    label: "Reforço",
    body:
      "Oi {nome}! Passando novamente para não deixar você sem retorno.\n" +
      "Se quiser, posso te explicar como funcionam as aulas, horários e planos da academia.",
  },
  {
    step: 3,
    label: "Pergunta objetiva",
    body:
      "Para eu te ajudar mais rápido, me responde só isso: você procura aula infantil, juvenil ou adulto?",
  },
  {
    step: 4,
    label: "Reabertura",
    body:
      "Bom dia! Passando para retomar seu atendimento.\n" +
      "Se ainda fizer sentido para você, posso te explicar direitinho como funciona a {academia}.",
  },
  {
    step: 5,
    label: "Checagem simples",
    body:
      "Oi! Estou tentando falar com você para te ajudar da melhor forma possível.\n" +
      "Se ainda tiver interesse, me responde com um “sim” que eu sigo com você por aqui.",
  },
  {
    step: 6,
    label: "Pergunta direta",
    body:
      "Conseguiu ver minhas mensagens?\n" +
      "Quero entender se você ainda tem interesse em conhecer a academia ou iniciar os treinos.",
  },
  {
    step: 7,
    label: "Convite leve",
    body:
      "Se fizer sentido para você, posso te passar como funcionam as aulas, os horários e a melhor forma de começar.",
  },
  {
    step: 8,
    label: "Encerramento elegante",
    body:
      "Como não tive retorno, vou encerrar seu atendimento ativo por enquanto para organizar aqui nossos contatos.\n" +
      "Mas seu número ficará salvo e, quando quiser retomar, é só me chamar.",
  },
];

export const NOVO_LEAD_TOTAL_STEPS = NOVO_LEAD_TEMPLATES.length;

// ──────────────────────────────────────────────────────────────────────────
// Renderer
// ──────────────────────────────────────────────────────────────────────────

export type TemplateVars = {
  nome: string;
  atendente: string;
  academia: string;
};

/** Pega apenas o primeiro nome — "Maria Silva Costa" → "Maria". */
export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return "tudo bem";
  const trimmed = fullName.trim();
  if (!trimmed) return "tudo bem";
  return trimmed.split(/\s+/)[0]!;
}

/**
 * Substitui {placeholders} no template. Tolera placeholder ausente — deixa
 * o token literal (ex: "{telefone}") em vez de jogar erro, pra evitar travar
 * o cron com bug de tipagem.
 */
export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (key in vars) {
      return vars[key as keyof TemplateVars];
    }
    return match;
  });
}

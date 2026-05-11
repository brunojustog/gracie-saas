/**
 * Catálogo central de templates de mensagem automática.
 *
 * Cada template tem um `key` slug semântico ("welcome.m1",
 * "appointment.confirm", "appointment.d-1", "attendance.post", …) que é
 * persistido em `MessageJob.templateKey`. O renderer suporta placeholders
 * {nome}, {atendente}, {academia}, {dia}, {horario}, {modalidade}, {endereco}.
 *
 * Textos foram extraídos do Playbook Comercial oficial da Gracie Barra
 * Anália Franco (v1).
 */

export type MessageTemplate = {
  key: string;
  /** Etiqueta interna (log/admin); não vai pro cliente. */
  label: string;
  body: string;
};

// ──────────────────────────────────────────────────────────────────────────
// Etapa 1 — Novo Lead (cadência de 8 mensagens em 7 dias)
// ──────────────────────────────────────────────────────────────────────────

export const WELCOME_TEMPLATES: ReadonlyArray<MessageTemplate> = [
  {
    key: "welcome.m1",
    label: "Boas-vindas",
    body:
      "Oi {nome}, tudo bem? Aqui é a {atendente} da {academia}.\n" +
      "Vi seu interesse e estou passando para te ajudar.\n" +
      "Me fala uma coisa: você está buscando aula para você ou para outra pessoa?",
  },
  {
    key: "welcome.m2",
    label: "Reforço",
    body:
      "Oi {nome}! Passando novamente para não deixar você sem retorno.\n" +
      "Se quiser, posso te explicar como funcionam as aulas, horários e planos da academia.",
  },
  {
    key: "welcome.m3",
    label: "Pergunta objetiva",
    body:
      "Para eu te ajudar mais rápido, me responde só isso: você procura aula infantil, juvenil ou adulto?",
  },
  {
    key: "welcome.m4",
    label: "Reabertura",
    body:
      "Bom dia! Passando para retomar seu atendimento.\n" +
      "Se ainda fizer sentido para você, posso te explicar direitinho como funciona a {academia}.",
  },
  {
    key: "welcome.m5",
    label: "Checagem simples",
    body:
      "Oi! Estou tentando falar com você para te ajudar da melhor forma possível.\n" +
      "Se ainda tiver interesse, me responde com um “sim” que eu sigo com você por aqui.",
  },
  {
    key: "welcome.m6",
    label: "Pergunta direta",
    body:
      "Conseguiu ver minhas mensagens?\n" +
      "Quero entender se você ainda tem interesse em conhecer a academia ou iniciar os treinos.",
  },
  {
    key: "welcome.m7",
    label: "Convite leve",
    body:
      "Se fizer sentido para você, posso te passar como funcionam as aulas, os horários e a melhor forma de começar.",
  },
  {
    key: "welcome.m8",
    label: "Encerramento elegante",
    body:
      "Como não tive retorno, vou encerrar seu atendimento ativo por enquanto para organizar aqui nossos contatos.\n" +
      "Mas seu número ficará salvo e, quando quiser retomar, é só me chamar.",
  },
];

// ──────────────────────────────────────────────────────────────────────────
// Etapa 3 — Agendamento (4 lembretes obrigatórios + 3 mensagens de no-show)
// ──────────────────────────────────────────────────────────────────────────

export const APPOINTMENT_TEMPLATES: ReadonlyArray<MessageTemplate> = [
  {
    key: "appointment.confirm",
    label: "Confirmação de agendamento (no momento do agendamento)",
    body:
      "Perfeito, ficou confirmado.\n" +
      "📅 Data: {dia}\n" +
      "⏰ Horário: {horario}\n" +
      "📍 Local: {academia}\n" +
      "{endereco}\n\n" +
      "Se surgir qualquer imprevisto, me avisa por aqui.",
  },
  {
    key: "appointment.d-1",
    label: "Lembrete no dia anterior (D-1 às 18h)",
    body:
      "Oi {nome}! Passando para confirmar sua visita/aula na {academia} amanhã às {horario}.",
  },
  {
    key: "appointment.d-0",
    label: "Lembrete no dia (D-0 manhã)",
    body:
      "Bom dia, {nome}! Tudo certo para sua visita/aula hoje na {academia} às {horario}?",
  },
  {
    key: "appointment.1h-before",
    label: "Lembrete 1h antes",
    body:
      "Olá {nome}! Passando pra te avisar que o Professor já está na academia. " +
      "Já confirmei pra ele a sua presença na aula. Estou separando seu kimono e faixa. " +
      "Te vejo em breve.\n" +
      "Caso queira chegar 15 min antes pra conhecer nossa unidade, será um prazer.\nOSS",
  },
  {
    key: "appointment.no-show-1",
    label: "No-show — mesmo dia",
    body:
      "Oi {nome}! Percebi que você não conseguiu vir hoje. Aconteceu algum imprevisto?",
  },
  {
    key: "appointment.no-show-2",
    label: "No-show — D+2 (quer remarcar?)",
    body:
      "Sem problema, isso acontece.\n" +
      "Quer remarcar pra quando?",
  },
  {
    key: "appointment.no-show-3",
    label: "No-show — D+5 (encerramento)",
    body:
      "Como não tive retorno, vou encerrar esse agendamento por enquanto.\n" +
      "Mas, se quiser remarcar depois, é só me chamar.",
  },
];

// ──────────────────────────────────────────────────────────────────────────
// Etapa 4 — Comparecimento (mensagem imediata pós-aula)
// ──────────────────────────────────────────────────────────────────────────

export const ATTENDANCE_TEMPLATES: ReadonlyArray<MessageTemplate> = [
  {
    key: "attendance.post",
    label: "Pós-comparecimento (imediato após sair da academia)",
    body:
      "Foi um prazer receber você hoje na {academia}.\n" +
      "Qualquer dúvida que tenha ficado, pode me chamar por aqui. " +
      "Vou te acompanhar para te ajudar na melhor decisão.",
  },
];

// ──────────────────────────────────────────────────────────────────────────
// Catálogo unificado + lookup
// ──────────────────────────────────────────────────────────────────────────

export const ALL_TEMPLATES: ReadonlyArray<MessageTemplate> = [
  ...WELCOME_TEMPLATES,
  ...APPOINTMENT_TEMPLATES,
  ...ATTENDANCE_TEMPLATES,
];

const TEMPLATE_BY_KEY = new Map(ALL_TEMPLATES.map((t) => [t.key, t]));

export function getTemplate(key: string): MessageTemplate | undefined {
  return TEMPLATE_BY_KEY.get(key);
}

export const WELCOME_KEYS = WELCOME_TEMPLATES.map((t) => t.key);
export const WELCOME_LAST_KEY = WELCOME_KEYS[WELCOME_KEYS.length - 1]!;

// ──────────────────────────────────────────────────────────────────────────
// Renderer
// ──────────────────────────────────────────────────────────────────────────

export type TemplateVars = {
  nome: string;
  atendente: string;
  academia: string;
  /** Apenas pra templates de agendamento. */
  dia?: string;
  horario?: string;
  modalidade?: string;
  endereco?: string;
};

export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return "tudo bem";
  const trimmed = fullName.trim();
  if (!trimmed) return "tudo bem";
  return trimmed.split(/\s+/)[0]!;
}

/**
 * Substitui {placeholders} no template. Tolera placeholder ausente — deixa
 * o token literal (ex: "{horario}") em vez de explodir, pra não travar
 * o cron com bug de tipagem ou template novo.
 */
export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key as keyof TemplateVars];
    if (typeof value === "string" && value.length > 0) return value;
    return match;
  });
}

/** Formata Date pra "10/03/2026 (terça-feira)" em BRT. */
export function formatBrDate(date: Date): string {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "long",
  });
  // Intl retorna "terça-feira, 10/03/2026". Reordenamos.
  const parts = fmt.formatToParts(date);
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  return `${day}/${month}/${year} (${weekday})`;
}

/** Formata Date pra "18:30" em BRT (sem segundos). */
export function formatBrTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

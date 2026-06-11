/* Gera docs/fechamento-diario-supervisor.docx — roteiro do fechamento
 * diário do supervisor comercial com as vendedoras (GB Anália Franco). */
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, LevelFormat, HeadingLevel, BorderStyle, WidthType,
  ShadingType,
} = require(process.env.APPDATA + "/npm/node_modules/docx");

// A4: 11906 x 16838 DXA; margens 1" → conteúdo 9026 DXA
const CONTENT = 9026;

const border = { style: BorderStyle.SINGLE, size: 1, color: "BBBBBB" };
const borders = { top: border, bottom: border, left: border, right: border };
const cellMargins = { top: 80, bottom: 80, left: 120, right: 120 };

const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const p = (children, opts = {}) =>
  new Paragraph({ children: Array.isArray(children) ? children : [new TextRun(children)], spacing: { after: 120 }, ...opts });
const b = (t) => new TextRun({ text: t, bold: true });
const r = (t) => new TextRun(t);
const bullet = (children) =>
  new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 60 },
    children: Array.isArray(children) ? children : [new TextRun(children)],
  });
const check = (children) =>
  new Paragraph({
    numbering: { reference: "checks", level: 0 },
    spacing: { after: 60 },
    children: Array.isArray(children) ? children : [new TextRun(children)],
  });

const headCell = (t, w) =>
  new TableCell({
    borders, width: { size: w, type: WidthType.DXA },
    shading: { fill: "1F2937", type: ShadingType.CLEAR },
    margins: cellMargins,
    children: [p([new TextRun({ text: t, bold: true, color: "FFFFFF", size: 20 })], { spacing: { after: 0 } })],
  });
const cell = (content, w, fill) =>
  new TableCell({
    borders, width: { size: w, type: WidthType.DXA },
    margins: cellMargins,
    ...(fill ? { shading: { fill, type: ShadingType.CLEAR } } : {}),
    children: (Array.isArray(content) ? content : [content]).map((c) =>
      typeof c === "string"
        ? p([new TextRun({ text: c, size: 20 })], { spacing: { after: 0 } })
        : c,
    ),
  });

// ── Parte 1: tabela de coleta ──────────────────────────────────────────────
const COLETA_W = [4226, 1400, 1400, 2000];
const coletaRows = [
  ["1. Quantos leads novos chegaram pra você hoje?"],
  ["2. Quantos follow-ups você fez na coluna Novo Lead?"],
  ["3. Quantos leads você moveu pra Potencial?"],
  ["4. Quantos follow-ups você fez no Potencial?"],
  ["5. Quantas aulas experimentais você agendou hoje?"],
  ["6. Quantos comparecimentos teve hoje?"],
  ["7. Quantas faltas teve hoje? O que foi feito com cada uma?"],
  ["8. Quantas matrículas você fechou hoje?"],
  ["9. Quantos cancelamentos / congelamentos teve hoje?"],
  ["10. Quantos inadimplentes você cobrou hoje? Quantos pagamentos confirmou?"],
];
const coletaTable = new Table({
  width: { size: CONTENT, type: WidthType.DXA },
  columnWidths: COLETA_W,
  rows: [
    new TableRow({
      tableHeader: true,
      children: [
        headCell("Pergunta (fazer ANTES de abrir o sistema)", COLETA_W[0]),
        headCell("Ela disse", COLETA_W[1]),
        headCell("Sistema", COLETA_W[2]),
        headCell("Bate? / Por quê?", COLETA_W[3]),
      ],
    }),
    ...coletaRows.map(
      ([q], i) =>
        new TableRow({
          children: [
            cell(q, COLETA_W[0], i % 2 ? "F3F4F6" : undefined),
            cell("", COLETA_W[1], i % 2 ? "F3F4F6" : undefined),
            cell("", COLETA_W[2], i % 2 ? "F3F4F6" : undefined),
            cell("", COLETA_W[3], i % 2 ? "F3F4F6" : undefined),
          ],
        }),
    ),
  ],
});

// ── Parte 2: onde conferir ─────────────────────────────────────────────────
const ONDE_W = [3000, 6026];
const ondeRows = [
  ["Leads novos", "Dashboard → filtro da vendedora + período personalizado (hoje → hoje) → KPI “Leads novos”."],
  ["Follow-ups feitos", "Diário do lead (abrir o card → aba Histórico). É o ÚNICO número sem contador automático — confira por amostragem: abra 2 ou 3 cards que ela citou e veja se a observação está lá. Regra da casa: follow sem registro no diário = follow não feito."],
  ["Movidos pra Potencial", "Kanban → coluna Potencial. Toda movimentação fica gravada no histórico do lead, com hora e autor — dá pra auditar card por card."],
  ["Aulas agendadas", "Agenda → chips no topo (visão “dia” mostra só hoje) + Dashboard → KPI “Aulas agendadas”."],
  ["Comparecimentos", "Agenda → chip verde “compareceram” (visão dia) + Dashboard → KPI “Comparecimentos”."],
  ["Faltas", "Agenda → chip vermelho “faltas” (visão dia)."],
  ["Matrículas", "Dashboard → KPI “Matrículas” + tela Matrículas (mais recentes no topo)."],
  ["Cancelamentos / congelamentos", "Tela Matrículas → filtro de status “Cancelada” / “Congelada”."],
  ["Cobranças e pagamentos", "Tela Matrículas → filtro “Inadimplentes” (quem segue devendo). Pagamento confirmado aparece no diário do aluno e o vencimento avança 1 mês."],
];
const ondeTable = new Table({
  width: { size: CONTENT, type: WidthType.DXA },
  columnWidths: ONDE_W,
  rows: [
    new TableRow({
      tableHeader: true,
      children: [headCell("Número", ONDE_W[0]), headCell("Onde conferir no sistema", ONDE_W[1])],
    }),
    ...ondeRows.map(
      ([a, bb], i) =>
        new TableRow({
          children: [
            cell([p([new TextRun({ text: a, bold: true, size: 20 })], { spacing: { after: 0 } })], ONDE_W[0], i % 2 ? "F3F4F6" : undefined),
            cell(bb, ONDE_W[1], i % 2 ? "F3F4F6" : undefined),
          ],
        }),
    ),
  ],
});

const doc = new Document({
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 32, bold: true, font: "Arial" },
        paragraph: { spacing: { before: 280, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "1F2937" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      { reference: "checks",
        levels: [{ level: 0, format: LevelFormat.BULLET, text: "☐", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      { reference: "numbers",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
    ],
  },
  sections: [
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838 }, // A4
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 60 },
          children: [new TextRun({ text: "Fechamento Diário do Funil de Vendas", bold: true, size: 40 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 240 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C8102E", space: 4 } },
          children: [new TextRun({ text: "Roteiro do supervisor comercial — Gracie Barra Anália Franco", size: 24, color: "555555" })],
        }),

        h1("Objetivo"),
        p([
          r("Fechar o dia de "),
          b("cada vendedora"),
          r(", individualmente, no fim do expediente dela (10–15 min), em frente ao sistema. O fechamento tem 3 funções: "),
          b("(1)"), r(" coletar os números do dia na palavra dela; "),
          b("(2)"), r(" comparar com o que está registrado no sistema; "),
          b("(3)"), r(" corrigir as diferenças NA HORA, antes de ela ir embora."),
        ]),
        p([
          b("Regra de ouro: o que não está no sistema não existe. "),
          r("Hoje o problema não é falta de trabalho — é trabalho feito e não registrado. Enquanto o registro diário não virar hábito, este ritual é o que garante que os relatórios digam a verdade."),
        ]),

        h1("Parte 1 — Coleta (perguntar de viva voz, ANTES de abrir o sistema)"),
        p("Pergunte e anote a resposta dela primeiro. Só depois abra o sistema e preencha a coluna ao lado. A ordem importa: se ela vir os números antes, a coleta não mede nada."),
        coletaTable,
        p([new TextRun({ text: "Atenção ao item de follow-ups: é o único número que o sistema não conta sozinho — só fica registrado se ela escrever a observação no diário do lead. Por isso a regra: follow sem registro = follow não feito.", italics: true, size: 20 })], { spacing: { before: 120, after: 0 } }),

        new Paragraph({ pageBreakBefore: true, heading: HeadingLevel.HEADING_1, children: [new TextRun("Parte 2 — Onde conferir cada número no sistema")] }),
        p([r("Antes de chamar a vendedora, abra o "), b("Dashboard"), r(" e selecione: filtro de vendedora = ela, período = personalizado com a data de hoje nos dois campos. Os KPIs do topo já respondem a maioria das perguntas.")]),
        ondeTable,

        h1("Parte 3 — Pendências a zerar antes de encerrar o dia"),
        p("Depois de conciliar os números, rodar este checklist com ela. Nada disso fica pra amanhã:"),
        check([r("Agenda sem nenhuma aula “sem registro” (chip cinza “!”) — toda aula que já aconteceu tem comparecimento ou falta marcados.")]),
        check([r("Toda falta de hoje tem um destino: "), b("reagendada"), r(", em recuperação (follow), ou virou "), b("perda com motivo"), r(".")]),
        check([r("Aulas de "), b("amanhã"), r(" todas confirmadas com o aluno (confirmação de véspera é o que mais aumenta comparecimento).")]),
        check([r("Kanban sem nenhum card “"), b("sem vendedora"), r("” — leads entram sozinhos pelo ManyChat/Chatwoot/site e precisam de dono no mesmo dia.")]),
        check([r("Leads com "), b("bolinha vermelha"), r(" (5+ dias sem interação): qual é o plano pra cada um?")]),
        check([r("Cards com follow-up automático “"), b("Falhou"), r("” ou “"), b("Pausado"), r("” revisados — alguém assumiu a conversa?")]),
        check([r("Perdas do dia com "), b("motivo verdadeiro"), r(" (não genérico tipo “sem interesse” sem contexto).")]),
        check([r("Pagamentos recebidos hoje "), b("confirmados no sistema"), r(" (botão verde na tela Matrículas) — senão o aluno aparece como inadimplente amanhã.")]),

        h1("Parte 4 — Como tratar as divergências"),
        bullet([r("Divergência não é bronca, é "), b("treino"), r(". A correção é feita na hora e "), b("quem mexe no sistema é a vendedora"), r(" (ela opera, o supervisor orienta). É assim que o hábito se forma.")]),
        bullet([r("Anote o "), b("tipo de furo recorrente"), r(" de cada uma (ex.: “não registra follow”, “não marca falta”). Na semana seguinte, foque nisso.")]),
        bullet([r("Meta: divergência ZERO. Quando uma vendedora bater os números por "), b("2 semanas seguidas"), r(", o fechamento dela pode ficar mais curto (só o checklist da Parte 3).")]),

        h1("Parte 5 — Três perguntas pra encerrar a conversa"),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 60 },
          children: [b("Tudo que você fez hoje está no sistema? "), r("Faltou alguma coisa? Por quê?")] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 60 },
          children: [b("Quais são seus 3 leads prioritários de amanhã? "), r("(devem estar com follow agendado ou aula marcada)")] }),
        new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { after: 60 },
          children: [b("Precisa de algo de mim pra amanhã? "), r("(autorização, material, ajuda com algum lead difícil)")] }),

        h1("O que NÃO entra no fechamento diário (fica pra reunião semanal)"),
        p("Pra não pesar o ritual diário, métricas de período longo ficam pra 1 conversa semanal com a equipe toda:"),
        bullet("Conversão por vendedora (matrículas ÷ leads) e ranking do período."),
        bullet("Motivos de perda agregados — o que o funil está dizendo?"),
        bullet("Tempo médio de primeira resposta ao lead novo."),
        bullet("Inadimplência total e recuperação de cobranças."),
        bullet("Qualidade dos agendamentos: taxa de comparecimento por vendedora."),
      ],
    },
  ],
});

const out = path.join(__dirname, "fechamento-diario-supervisor.docx");
Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(out, buf);
  console.log("OK:", out);
});

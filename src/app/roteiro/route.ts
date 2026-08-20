/**
 * v1.2-G: roteiro de teste do app, público, em app.<tenant>/roteiro.
 * Serve um HTML autocontido (fora do layout do app) pra mandar pro Anderson.
 */
export const dynamic = "force-static";

const HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Roteiro de Teste — GB Anália Franco</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,700;12..96,800&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>
  :root {
    --bg: #f6f2ef; --surface: #ffffff; --surface-2: #f0eae6;
    --ink: #1c1512; --ink-soft: #4a3d37; --muted: #7a6b63;
    --line: #e2d8d1; --line-strong: #cdbfb6;
    --accent: #b0202a; --accent-deep: #7c0f16; --accent-tint: #f7e6e5;
    --ok: #2f7a56; --ok-tint: #e3f0e9;
    --warn: #b06a10; --warn-tint: #f6ebd8;
    --f-branca: #e6e1db; --f-azul: #245ba6; --f-roxa: #6a2f9c; --f-marrom: #6a4327; --f-preta: #1a1512;
    --shadow: 0 1px 2px rgba(28,21,18,.05), 0 8px 24px -12px rgba(28,21,18,.18);
    --radius: 14px;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #15100e; --surface: #1f1815; --surface-2: #271e1a;
      --ink: #f3ebe6; --ink-soft: #d8cabf; --muted: #a3928a;
      --line: #33261f; --line-strong: #4a382f;
      --accent: #e8555c; --accent-deep: #c93a41; --accent-tint: #331715;
      --ok: #5cbd8d; --ok-tint: #16281f; --warn: #e0a445; --warn-tint: #2c2113;
      --f-branca: #cfc7be; --f-azul: #4f89d6; --f-roxa: #a065d8; --f-marrom: #a06e46; --f-preta: #0d0a08;
      --shadow: 0 1px 2px rgba(0,0,0,.3), 0 10px 30px -14px rgba(0,0,0,.6);
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; background: var(--bg); color: var(--ink);
    font-family: "IBM Plex Sans", system-ui, sans-serif;
    font-size: 16px; line-height: 1.6; -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 760px; margin: 0 auto; padding: 0 22px; }
  h1, h2, h3 { font-family: "Bricolage Grotesque", system-ui, sans-serif; font-weight: 700; line-height: 1.1; letter-spacing: -0.02em; text-wrap: balance; margin: 0; }
  .eyebrow { font-family: "IBM Plex Mono", monospace; font-weight: 600; font-size: 12px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); }
  p { margin: 0 0 14px; }
  strong { font-weight: 600; }
  code { font-family: "IBM Plex Mono", monospace; font-size: .92em; background: var(--surface-2); border: 1px solid var(--line); padding: 1px 6px; border-radius: 6px; }
  header.top { background: var(--surface); border-bottom: 1px solid var(--line); padding: 48px 0 32px; position: relative; overflow: hidden; }
  header.top::before { content: ""; position: absolute; inset: 0 0 auto 0; height: 4px; background: linear-gradient(90deg, var(--f-branca) 0 20%, var(--f-azul) 20% 40%, var(--f-roxa) 40% 60%, var(--f-marrom) 60% 80%, var(--f-preta) 80% 100%); }
  h1.title { font-size: clamp(32px, 5.5vw, 52px); margin: 12px 0 12px; }
  h1.title .r { color: var(--accent); }
  .lede { font-size: 17px; color: var(--ink-soft); margin: 0; }
  .access { margin: 22px 0 0; border-radius: var(--radius); background: var(--accent); color: #fff; padding: 20px 22px; box-shadow: var(--shadow); }
  .access .lbl { font-family: "IBM Plex Mono", monospace; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; opacity: .85; }
  .access .url { font-family: "IBM Plex Mono", monospace; font-size: clamp(16px, 3.4vw, 22px); font-weight: 600; margin: 4px 0 2px; word-break: break-all; }
  .access p { color: rgba(255,255,255,.92); margin: 8px 0 0; font-size: 14px; }
  section { padding: 30px 0; border-bottom: 1px solid var(--line); }
  h2 { font-size: clamp(22px, 3.4vw, 30px); margin: 6px 0 6px; }
  .callout { border-radius: 12px; padding: 16px 18px; margin: 0 0 8px; border: 1px solid; font-size: 14.5px; }
  .callout.warn { background: var(--warn-tint); border-color: color-mix(in srgb, var(--warn) 35%, transparent); color: var(--ink-soft); }
  .callout.ok { background: var(--ok-tint); border-color: color-mix(in srgb, var(--ok) 30%, transparent); color: var(--ink-soft); }
  .callout b { color: var(--ink); }
  .step { display: grid; grid-template-columns: 40px 1fr; gap: 16px; padding: 14px 0; border-top: 1px solid var(--line); }
  .step:first-of-type { border-top: 0; }
  .step .n { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; background: var(--accent-tint); color: var(--accent-deep); font-family: "IBM Plex Mono", monospace; font-weight: 600; font-size: 15px; }
  .step h3 { font-size: 17px; margin-bottom: 4px; }
  .step p { margin: 0; font-size: 14.5px; color: var(--ink-soft); }
  .step .path { display: inline-block; margin-top: 6px; font-family: "IBM Plex Mono", monospace; font-size: 12px; background: var(--surface-2); border: 1px solid var(--line); padding: 3px 8px; border-radius: 6px; color: var(--ink-soft); }
  .part-badge { display: inline-flex; align-items: center; gap: 8px; font-family: "IBM Plex Mono", monospace; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--accent); }
  .tag { display: inline-block; font-family: "IBM Plex Mono", monospace; font-size: 10px; letter-spacing: .08em; padding: 2px 7px; border-radius: 999px; background: var(--surface-2); border: 1px solid var(--line); color: var(--muted); text-transform: uppercase; }
  footer { padding: 34px 0 60px; color: var(--muted); font-size: 13px; }
  @media (max-width: 560px) { .step { grid-template-columns: 32px 1fr; gap: 12px; } }
</style>
</head>
<body>
<header class="top">
  <div class="wrap">
    <div class="eyebrow">Gracie Barra Anália Franco · App do aluno</div>
    <h1 class="title">Roteiro de <span class="r">Teste</span></h1>
    <p class="lede">Passo a passo pra testar tudo o que foi construído — check-in, chamada, graduação, cadastro e inativação de professor.</p>
    <div class="access">
      <div class="lbl">Endereço do app</div>
      <div class="url">app.gbanaliafranco.com.br</div>
      <p>Abra esse link no celular e faça login com o email e a senha do aluno. Não precisa baixar de nenhuma loja.</p>
    </div>
  </div>
</header>

<section>
  <div class="wrap">
    <div class="eyebrow" style="color:var(--muted)">Antes de tudo</div>
    <h2>Como o aluno recebe o acesso</h2>
    <div class="callout ok">
      <b>Novo:</b> ao cadastrar o aluno (ou redefinir a senha), marque
      <b>“Enviar acesso por WhatsApp”</b> — o sistema manda pro celular dele o
      link + login (+ senha) prontinho. Também dá pra reenviar pelo botão de
      envio ao lado de cada aluno na lista. Precisa do <b>telefone preenchido</b>
      e do WhatsApp (Wuzapi) conectado — o da GB Anália Franco já está.
    </div>
    <div class="callout warn">
      Sem o WhatsApp, o envio é <b>manual</b>: você passa pro aluno o endereço
      <code>app.gbanaliafranco.com.br</code> mais o <b>email e a senha</b> que
      definiu no cadastro.
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="part-badge">Parte 0 — Preparação · <span class="tag">você, uma vez</span></div>
    <h2>Deixar o terreno pronto</h2>
    <div class="step"><div class="n">1</div><div>
      <h3>Definir a localização da academia (geofence)</h3>
      <p>O aluno só bate presença dentro do raio. Para testar de fora, clique “Usar minha localização” de onde você está, ou “Desligar geofence”. Em produção, faça isso dentro da academia.</p>
      <span class="path">Config → Alunos (acesso ao app) → Localização da academia</span>
    </div></div>
    <div class="step"><div class="n">2</div><div>
      <h3>Conferir a grade do dia</h3>
      <p>O aluno só vê e bate check-in nas aulas da grade. A grade do GBAF já está cadastrada — teste num dia/horário que tenha aula.</p>
      <span class="path">Config → Grade de aulas</span>
    </div></div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="part-badge">Parte 1 — Cadastro · <span class="tag">você</span></div>
    <h2>Criar um aluno de teste</h2>
    <div class="step"><div class="n">3</div><div>
      <h3>Cadastrar aluno</h3>
      <p>Preencha nome, <b>telefone</b>, email (login), senha e faixa/grau. Marque “Enviar acesso por WhatsApp” e clique Cadastrar.</p>
      <span class="path">Config → Alunos → Cadastrar aluno</span>
    </div></div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="part-badge">Parte 2 — Aluno · <span class="tag">Etapa 1 · check-in</span></div>
    <h2>Entrar e bater presença</h2>
    <div class="step"><div class="n">4</div><div>
      <h3>Login do aluno</h3>
      <p>No celular, abra <code>app.gbanaliafranco.com.br</code> e entre com o email/senha do aluno. Dica: use uma aba anônima pra ficar logado como aluno e como Anderson ao mesmo tempo.</p>
    </div></div>
    <div class="step"><div class="n">5</div><div>
      <h3>Instalar como app</h3>
      <p>Android: toque em “Instalar o app no celular”. iPhone (Safari): Compartilhar → Adicionar à Tela de Início. Vira ícone GB, abre em tela cheia.</p>
    </div></div>
    <div class="step"><div class="n">6</div><div>
      <h3>Fazer check-in</h3>
      <p>Na tela do aluno, em “Aulas do dia”, toque em “Fazer check-in” e permita o GPS. Deve aparecer “Presença registrada!”. Erro de distância = geofence (volte à Parte 0).</p>
    </div></div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="part-badge">Parte 3 — Professor · <span class="tag">Etapa 1 · chamada</span></div>
    <h2>Confirmar a presença</h2>
    <div class="step"><div class="n">7</div><div>
      <h3>Abrir a chamada</h3>
      <p>Logado como Anderson (admin) ou professor, entre em Chamada. Você vê a aula do dia com quem bateu check-in. Toque em “Confirmar” a presença; use “Adicionar” para quem veio sem bater.</p>
      <span class="path">/professor → Chamada</span>
    </div></div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="part-badge">Parte 4 — Professor · <span class="tag">Etapa 2 · graduação</span></div>
    <h2>Graduar pelo celular</h2>
    <div class="step"><div class="n">8</div><div>
      <h3>Graduar o aluno</h3>
      <p>Em Graduar, ache o aluno (o selo “graduação disponível” aparece pela contagem de presenças). Toque em “Graduar” — faixa e grau já vêm sugeridos — tire a foto do momento e confirme.</p>
      <span class="path">/professor → Graduar</span>
    </div></div>
    <div class="step"><div class="n">9</div><div>
      <h3>Ver na linha do tempo</h3>
      <p>Volte ao app do aluno: a faixa nova, a barra de progresso e a graduação (com foto) aparecem na “Linha do tempo”.</p>
    </div></div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="part-badge">Parte 5 — Gestão · <span class="tag">Etapas 3 e 4</span></div>
    <h2>Cadastro, filtros e professores</h2>
    <div class="step"><div class="n">10</div><div>
      <h3>Filtros e edição de alunos</h3>
      <p>Teste a busca, o filtro por faixa e status, e a ordenação “Graduação (maior → menor)”. Edite a ficha de um aluno e redefina a senha (com opção de mandar no WhatsApp).</p>
      <span class="path">Config → Alunos</span>
    </div></div>
    <div class="step"><div class="n">11</div><div>
      <h3>Inativar um professor com segurança</h3>
      <p>Edite um professor e desligue “Ativo”. Aparece o aviso de quantas aulas da grade serão desativadas. Salve e confirme que o histórico (aulas dadas, presenças, notas fiscais) continua intacto.</p>
      <span class="path">Config → Professores</span>
    </div></div>
  </div>
</section>

<footer>
  <div class="wrap">
    Deu algum erro ou faltou algo? Anota o passo (ex.: “Parte 2, passo 6”) e
    manda pro Bruno áudio ou print. As próximas etapas (financeiro em banco
    digital) entram depois deste teste.
  </div>
</footer>
</body>
</html>`;

export function GET() {
  return new Response(HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    },
  });
}

/**
 * Code.gs — porta de entrada do Web App.
 *
 * Dois pontos importantes:
 *  1. A página é SEMPRE servida pelo HtmlService, mesmo quando o HTML vem do GitHub.
 *     É isso que mantém google.script.run funcionando. Hospedar direto no GitHub Pages
 *     quebraria a ponte com o servidor.
 *  2. Todo acesso a dado passa por api(): sessão → permissão → execução → log. Nenhuma
 *     outra função é exposta ao cliente.
 */

/**
 * Duas versões da interface, de propósito:
 *   app    — a oficial. Exige login, lê e grava na planilha.
 *   proto  — o protótipo navegável, com dados fictícios. Serve para apresentar
 *            e para desenhar telas novas sem tocar na base real.
 * A oficial é o padrão. O protótipo só abre com ?p=proto na URL.
 */
function doGet(e) {
  const p = (e && e.parameter && e.parameter.p) || 'app';
  const arquivo = (p === 'proto' || p === 'demo') ? 'index' : 'app';
  const fonte = Cfg.param('UI_SOURCE', 'LOCAL');

  anotarUrlDoApp();

  // A UI é UM arquivo HTML só, autocontido (CSS e JS dentro dele).
  // Nada de <?!= include(...) ?>: scriptlet exige createTemplateFromFile, e se a página
  // for servida sem avaliar o template o navegador descarta as tags silenciosamente —
  // a página abre sem CSS e sem JS, e você não vê nenhum erro.
  const out = (fonte === 'GITHUB')
    ? HtmlService.createHtmlOutput(uiDoGitHub(p))
    : HtmlService.createHtmlOutputFromFile(arquivo);

  return out
    .setTitle('FC Salomé — Apontamento Financeiro' + (arquivo === 'index' ? ' (protótipo)' : ''))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setFaviconUrl('https://ssl.gstatic.com/docs/script/images/favicon.ico')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Guarda a URL pública do app — a que vai nos links dos e-mails.
 *
 * Por que aqui e não numa função do editor: `ScriptApp.getService().getUrl()` devolve
 * coisas diferentes conforme QUEM pergunta. Rodando pelo editor, devolve a URL de teste
 * terminada em "/dev", que só abre para quem edita o projeto — mandar aquilo num e-mail
 * é mandar um link que ninguém consegue abrir. Só dentro do app publicado ele devolve a
 * URL "/exec" de verdade.
 *
 * Trocar "/dev" por "/exec" no texto não resolve: o identificador da implantação de teste
 * é outro, e a URL montada assim aponta para lugar nenhum.
 *
 * Então a URL é anotada no primeiro acesso de alguém ao app publicado, que é exatamente
 * o momento em que ela existe e está certa. Custa uma leitura de propriedade por acesso.
 */
function anotarUrlDoApp() {
  try {
    const url = ScriptApp.getService().getUrl();
    if (!url || url.indexOf('/exec') < 0) return;      // /dev não serve para ninguém
    const publica = urlPublica(url);
    if (Cfg.prop('URL_APP') === publica) return;
    Cfg.setProp('URL_APP', publica);
  } catch (e) { /* URL é conveniência, nunca requisito: não derruba o acesso */ }
}

/**
 * Tira o "/a/dominio.com" do meio da URL.
 *
 * O Google devolve `script.google.com/a/iprocesso.com/macros/s/ID/exec` porque o dono do
 * script é de lá. Esse trecho é um pedido de "entre com uma conta deste domínio" — e o
 * pessoal da Salomé não tem conta @iprocesso.com. Eles cairiam numa tela de escolha de
 * conta antes de ver o login do app, e alguns nem passariam dali.
 *
 * A forma curta, `script.google.com/macros/s/ID/exec`, é a mesma implantação e abre para
 * qualquer um. É ela que vai nos e-mails.
 */
function urlPublica(url) {
  // O Google usa duas formas para a mesma coisa, conforme a época e o tipo de conta:
  //   /a/dominio.com/macros/s/ID/exec   e   /a/macros/dominio.com/s/ID/exec
  return String(url)
    .replace(/^(https:\/\/script\.google\.com)\/a\/macros\/[^/]+\/s\//, '$1/macros/s/')
    .replace(/^(https:\/\/script\.google\.com)\/a\/[^/]+\/macros\//,    '$1/macros/');
}

/** Modo GITHUB: busca o HTML no raw e guarda em cache. Trocar a UI vira um git push. */
function uiDoGitHub(rota) {
  const cache = CacheService.getScriptCache();
  const chave = 'UI_' + rota;
  const guardado = cache.get(chave);
  if (guardado) return guardado;

  const base = Cfg.param('GITHUB_RAW', '');
  if (!base) throw new Error('Defina GITHUB_RAW na aba PARAMETROS.');
  const resp = UrlFetchApp.fetch(base, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    throw new Error('Não consegui buscar a UI no GitHub (HTTP ' + resp.getResponseCode() + ').');
  }
  const html = resp.getContentText();
  // 100 KB é o teto por chave do CacheService; o app tem quase o dobro. Se não couber,
  // cada doGet busca do GitHub de novo — mais lento, porém correto.
  try { if (html.length < 90000) cache.put(chave, html, 21600); } catch (e) { /* ok */ }
  return html;
}

/** Force a recarga da UI depois de um push, sem esperar o cache expirar. */
function limparCacheUI() {
  CacheService.getScriptCache().removeAll(['UI_app', 'UI_mobile']);
  return 'cache da UI limpo';
}

/* ==========================================================================
   ROTEADOR
   ========================================================================== */

const ROTAS = {
  // públicas
  'auth.login':        { publica: true,  fn: function (d) { return Auth.login(d.email, d.senha, d.origem, d.userAgent); } },
  'ping':              { publica: true,  fn: function () { return { ok: true, hora: new Date() }; } },

  // sessão, sem recurso específico
  'auth.logout':       { sessao: true,   fn: function (d, s, t) { return Auth.logout(t); } },
  'auth.trocarSenha':  { sessao: true,   fn: function (d, s, t) { return Auth.trocarSenha(t, d.atual, d.nova); } },
  'bootstrap':         { sessao: true,   fn: function (d, s) { return bootstrap(s); } },

  // recursos
  'sol.listar':        { recurso: 'SOLICITACAO', acao: 'VER',      fn: function (d, s) { return Sol.listar(d, s); } },
  'sol.obter':         { recurso: 'SOLICITACAO', acao: 'VER',      fn: function (d, s) { return Sol.obter(d.id, s); } },
  'sol.simular':       { recurso: 'SOLICITACAO', acao: 'VER',      fn: function (d, s) { return Rules.simular(d, s); } },
  'sol.salvar':        { recurso: 'SOLICITACAO', acao: 'ALTERAR',  fn: function (d, s) { return Sol.salvar(d, s); } },
  'sol.decidir':       { recurso: 'SOLICITACAO', acao: 'APROVAR',  fn: function (d, s) { return Sol.decidir(d, s); } },
  'cash.fluxo':        { recurso: 'SOLICITACAO', acao: 'VER',      fn: function (d, s) { return Cash.fluxo(d, s); } },

  // Categoria -> conta contábil, centro sugerido e retenção. É o que o formulário chama
  // assim que o usuário escolhe "o que vai comprar" e "de quem".
  'cat.classificar':   { recurso: 'SOLICITACAO', acao: 'VER',      fn: function (d) { return Catalogo.classificar(d.categoriaId, d.fornecedorId); } },
  'cat.fornecedores':  { recurso: 'SOLICITACAO', acao: 'VER',      fn: function (d) { return Catalogo.fornecedoresDaCategoria(d.categoriaId); } },

  // Abertura do app: tudo o que a tela precisa em um round-trip só.
  'vista.abrir':       { sessao: true, fn: function (d, s) { return Vista.abrir(d, s); } },
  'vista.atualizar':   { sessao: true, fn: function (d, s) { return Vista.atualizar(d, s); } },

  // Quadro Kanban. 'fluxo.mover' é a regra que VALE — a da tela é só conforto imediato.
  'fluxo.quadro':      { recurso: 'SOLICITACAO', acao: 'VER',      fn: function (d, s) { return Fluxo.quadro(d, s); } },
  'fluxo.simular':     { recurso: 'SOLICITACAO', acao: 'VER',      fn: function (d, s) { return Fluxo.simularMovimento(d, s); } },
  'fluxo.mover':       { recurso: 'SOLICITACAO', acao: 'ALTERAR',  fn: function (d, s) { return Fluxo.mover(d, s); } },

  'cad.listar':        { recursoDe: true, acao: 'VER',      fn: function (d, s) { return Repo.listar(d.tabela, null, !!d.inativos); } },
  'cad.salvar':        { recursoDe: true, acao: 'ALTERAR',  fn: function (d, s) { return Repo.salvar(d.tabela, d.registro, s); } },
  'cad.inativar':      { recursoDe: true, acao: 'INATIVAR', fn: function (d, s) { return Repo.inativar(d.tabela, d.id, d.motivo, s); } },

  'log.historico':     { recurso: 'LOG', acao: 'VER', fn: function (d) { return Log.historico(d.registroId); } }
};

/**
 * Códigos que viajam sozinhos, sem texto. A tela usa o código para decidir o que fazer
 * (voltar ao login, por exemplo); a pessoa precisa de uma frase.
 */
const HUMANO = {
  SESSAO_INVALIDA: 'Sua sessão não é mais válida. Entre de novo.',
  SESSAO_EXPIRADA: 'Sua sessão expirou. Entre de novo.',
  SEM_PERMISSAO:   'Seu perfil não tem permissão para isso.',
  SEM_ALCADA:      'O valor está acima do seu limite de alçada.'
};

/** Única função chamada pelo cliente. */
function api(acao, payload, token) {
  const t0 = Date.now();
  payload = payload || {};
  let ses = null;
  try {
    const rota = ROTAS[acao];
    if (!rota) throw new Error('ACAO_DESCONHECIDA: ' + acao);

    if (!rota.publica) {
      ses = Auth.validar(token);
      const recurso = rota.recursoDe ? recursoDaTabela(payload.tabela) : rota.recurso;
      if (recurso) Perm.exigir(ses, recurso, rota.acao);
    }

    const dados = rota.fn(payload, ses, token);

    if (rota.acao && ['ALTERAR', 'INATIVAR', 'APROVAR'].indexOf(rota.acao) >= 0) {
      Log.ativ(ses, rota.recursoDe ? recursoDaTabela(payload.tabela) : rota.recurso,
               rota.acao, dados && (dados.id || (dados.registro && dados.registro[Object.keys(dados.registro)[0]])),
               dados && dados.diff);
    }
    return { ok: true, dados: dados, ms: Date.now() - t0 };
  } catch (err) {
    Log.erro(err, acao, payload);
    // O código só existe quando a mensagem vem no formato 'CODIGO: texto'. Sem isso,
    // o split devolvia a frase inteira como código e a tela mostrava tudo duplicado.
    const msg = String(err && err.message || err);
    const m = msg.match(/^([A-Z][A-Z0-9_]{2,})(?::\s*([\s\S]*))?$/);
    const codigo = m ? m[1] : 'ERRO';
    return {
      ok: false,
      codigo: codigo,
      mensagem: (m && m[2]) ? m[2] : (HUMANO[codigo] || msg),
      ms: Date.now() - t0
    };
  }
}

const TABELA_RECURSO = {
  PLANO_CONTAS: 'PLANO_CONTAS', FORNECEDORES: 'FORNECEDOR', FILIAIS: 'FILIAL', AREAS: 'AREA',
  CATEGORIAS: 'CATEGORIA', CENTROS_CUSTO: 'CENTRO_CUSTO', CENTRO_CONTA: 'CENTRO_CUSTO',
  USUARIOS: 'USUARIO', PERFIS: 'PERFIL', PERMISSOES: 'PERFIL', PERMISSOES_CAMPO: 'PERFIL',
  PARAMETROS: 'PARAMETRO', ORCAMENTO: 'ORCAMENTO', RATEIO: 'RATEIO',
  TITULOS_PAGAR: 'TITULO_PAGAR', TITULOS_RECEBER: 'TITULO_RECEBER',
  CONDICOES_PGTO: 'PARAMETRO', FORMAS_PGTO: 'PARAMETRO', ALCADAS: 'PARAMETRO', FERIADOS: 'PARAMETRO'
};

function recursoDaTabela(tabela) {
  const r = TABELA_RECURSO[tabela];
  if (!r) throw new Error('TABELA_NAO_PERMITIDA: ' + tabela);
  return r;
}

/** Um round-trip só: tudo que a tela precisa para montar. */
function bootstrap(ses) {
  return {
    usuario: ses,
    permissoes: Perm.resumo(ses),
    versao: Cfg.param('VERSAO_APP', '0.1.0'),
    parametros: {
      saldoMinimo: Cfg.param('SALDO_MINIMO_SEGURANCA', 0),
      horizonte: Cfg.param('HORIZONTE_SEMANAS', 12)
    },
    cadastros: {
      filiais:    Repo.listar('FILIAIS'),
      areas:      Repo.listar('AREAS'),
      centros:    Repo.listar('CENTROS_CUSTO'),
      categorias: Catalogo.listar(),
      etapas:     Fluxo.ETAPAS.map(function (e) { return { k: e, t: Fluxo.ROTULO[e] }; }),
      blocos:     Catalogo.BLOCOS,
      // Só conta analítica entra na lista: sintética é agrupamento e não aceita lançamento.
      contas:     Repo.listar('PLANO_CONTAS').filter(function (c) { return c.TIPO !== 'SINTETICA'; }),
      fornecedores: Repo.listar('FORNECEDORES'),
      condicoes:  Repo.listar('CONDICOES_PGTO'),
      formas:     Repo.listar('FORMAS_PGTO'),
      alcadas:    Repo.listar('ALCADAS')
    }
  };
}

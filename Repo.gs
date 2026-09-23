/**
 * Repo.gs — acesso genérico às abas. É o único lugar do sistema que toca em SpreadsheetApp.
 *
 * Três regras que valem sempre:
 *  1. Coluna é localizada pelo NOME (linha 1), nunca pela posição.
 *  2. Toda escrita passa por LockService.
 *  3. Nada é excluído: baixa é STATUS = INATIVO, com data, autor e motivo.
 */
const Repo = (function () {

  const CACHE_CADASTROS = ['PARAMETROS', 'FILIAIS', 'AREAS', 'PLANO_CONTAS', 'FORNECEDORES',
                           'CONDICOES_PGTO', 'FORMAS_PGTO', 'ALCADAS', 'PERFIS', 'PERMISSOES',
                           'PERMISSOES_CAMPO', 'FERIADOS'];

  function ss(planilha) {
    const id = Cfg.prop(planilha === 'FC_LOG' ? 'ID_FC_LOG' : 'ID_FC_DADOS');
    if (!id) throw new Error('Planilha ' + planilha + ' não configurada. Rode Setup.criarBases().');
    return SpreadsheetApp.openById(id);
  }

  /** Abre uma aba e devolve o contexto de trabalho: sheet, mapa de colunas e valores. */
  function abrir(tabela) {
    const def = SCHEMA[tabela];
    if (!def) throw new Error('Tabela desconhecida: ' + tabela);
    const sheet = ss(def.pl).getSheetByName(tabela);
    if (!sheet) throw new Error('Aba ' + tabela + ' não existe. Rode Setup.criarBases().');

    const valores = sheet.getDataRange().getValues();
    const cab = valores.length ? valores[0] : def.cols;
    const idx = {};
    cab.forEach(function (nome, i) { idx[String(nome).trim()] = i; });
    return { sheet: sheet, idx: idx, cab: cab, valores: valores, def: def };
  }

  /**
   * O CacheService recusa qualquer valor acima de 100 KB por chave — e estoura com
   * "Argument too large" em vez de simplesmente ignorar. O plano de contas da Salomé,
   * com 212 linhas e 27 colunas, passa disso com folga.
   *
   * Cache é otimização, nunca requisito: o que não couber é lido da planilha toda vez,
   * e ninguém percebe a diferença. O que não pode é derrubar a chamada.
   */
  const LIMITE_CACHE = 90000;   // margem sobre os 100 KB

  function guardarNoCache(cache, chave, dados) {
    try {
      const txt = JSON.stringify(dados);
      if (txt.length > LIMITE_CACHE) return;
      cache.put(chave, txt, 600);
    } catch (e) { /* cache cheio, indisponível, o que for — segue sem ele */ }
  }

  function linhaParaObjeto(ctx, linha, numeroLinha) {
    const o = { _linha: numeroLinha };
    ctx.cab.forEach(function (nome, i) { o[String(nome).trim()] = linha[i]; });
    return o;
  }

  /** Lista com cache para cadastros. filtro = função(obj) => boolean */
  function listar(tabela, filtro, incluirInativos) {
    let dados;
    const usaCache = CACHE_CADASTROS.indexOf(tabela) >= 0;
    const cache = CacheService.getScriptCache();

    if (usaCache) {
      const bruto = cache.get('T_' + tabela);
      if (bruto) dados = JSON.parse(bruto);
    }
    if (!dados) {
      const ctx = abrir(tabela);
      dados = [];
      for (let i = 1; i < ctx.valores.length; i++) {
        if (ctx.valores[i].join('') === '') continue;
        dados.push(linhaParaObjeto(ctx, ctx.valores[i], i + 1));
      }
      if (usaCache) guardarNoCache(cache, 'T_' + tabela, dados);
    }
    return dados.filter(function (o) {
      if (!incluirInativos && 'STATUS' in o && o.STATUS && o.STATUS !== 'ATIVO'
          && ['SOLICITACOES', 'TITULOS_PAGAR', 'TITULOS_RECEBER'].indexOf(tabela) < 0) return false;
      return filtro ? filtro(o) : true;
    });
  }

  function achar(tabela, campo, valor) {
    const achados = listar(tabela, function (o) { return o[campo] === valor; }, true);
    return achados.length ? achados[0] : null;
  }

  function invalidar(tabela) {
    CacheService.getScriptCache().remove('T_' + tabela);
    if (tabela === 'PARAMETROS') Cfg.invalidar();
  }

  /**
   * Grava. Cria se não houver chave; atualiza se houver.
   * Confere VERSAO para não sobrescrever alteração de outro usuário.
   */
  function salvar(tabela, registro, ses, opts) {
    opts = opts || {};
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const ctx = abrir(tabela);
      const chave = ctx.cab[0];                       // a 1ª coluna é sempre o ID da tabela
      const agora = new Date();
      // Quem assina a linha é a SESSÃO do app, não a conta Google de quem executa.
      // Perguntar ao Google exigiria o escopo userinfo.email — um dado que este sistema
      // não usa para nada, já que a autenticação é própria. Sem sessão, é 'sistema'.
      const email = (ses && ses.email) || 'sistema';

      let anterior = null;
      if (registro[chave]) {
        for (let i = 1; i < ctx.valores.length; i++) {
          if (String(ctx.valores[i][ctx.idx[chave]]) === String(registro[chave])) {
            anterior = linhaParaObjeto(ctx, ctx.valores[i], i + 1);
            break;
          }
        }
      }

      if (anterior && !opts.forcar && 'VERSAO' in anterior
          && Number(anterior.VERSAO) !== Number(registro.VERSAO)) {
        throw new Error('CONFLITO: outro usuário alterou este registro. Recarregue a tela.');
      }

      const novo = anterior ? Object.assign({}, anterior, registro) : Object.assign({}, registro);
      if (!novo[chave]) novo[chave] = Seq.proximo(tabela);
      if ('VERSAO' in ctx.idx)      novo.VERSAO = (anterior ? Number(anterior.VERSAO) : 0) + 1;
      if ('STATUS' in ctx.idx && !novo.STATUS) novo.STATUS = 'ATIVO';
      if (!anterior) {
        if ('CRIADO_EM' in ctx.idx)  novo.CRIADO_EM = agora;
        if ('CRIADO_POR' in ctx.idx) novo.CRIADO_POR = email;
      }
      if ('ALTERADO_EM' in ctx.idx)  novo.ALTERADO_EM = agora;
      if ('ALTERADO_POR' in ctx.idx) novo.ALTERADO_POR = email;

      const linha = ctx.cab.map(function (nome) {
        const v = novo[String(nome).trim()];
        return (v === undefined || v === null) ? '' : v;
      });

      if (anterior) {
        ctx.sheet.getRange(anterior._linha, 1, 1, linha.length).setValues([linha]);
      } else {
        ctx.sheet.appendRow(linha);
      }
      invalidar(tabela);
      return { registro: novo, anterior: anterior, diff: diferenca(anterior, novo, ctx.cab) };
    } finally {
      lock.releaseLock();
    }
  }

  /** Baixa lógica. O registro continua na planilha. */
  function inativar(tabela, id, motivo, ses) {
    const ctx = abrir(tabela);
    const chave = ctx.cab[0];
    const atual = achar(tabela, chave, id);
    if (!atual) throw new Error('Registro ' + id + ' não encontrado em ' + tabela + '.');
    atual.STATUS = 'INATIVO';
    atual.INATIVADO_EM = new Date();
    atual.INATIVADO_POR = (ses && ses.email) || 'sistema';
    atual.MOTIVO_INATIVACAO = motivo || '';
    return salvar(tabela, atual, ses, { forcar: true });
  }

  /** Gravação em lote — use na importação. Muito mais rápido que salvar linha a linha. */
  function inserirLote(tabela, registros, ses) {
    const lock = LockService.getScriptLock();
    lock.waitLock(30000);
    try {
      const ctx = abrir(tabela);
      const agora = new Date();
      const email = (ses && ses.email) || 'sistema';
      const chave = ctx.cab[0];
      const ids = Seq.reservar(tabela, registros.length);

      const linhas = registros.map(function (r, i) {
        const o = Object.assign({}, r);
        if (!o[chave]) o[chave] = ids[i];
        if ('VERSAO' in ctx.idx) o.VERSAO = 1;
        if ('STATUS' in ctx.idx && !o.STATUS) o.STATUS = 'ATIVO';
        if ('CRIADO_EM' in ctx.idx) o.CRIADO_EM = agora;
        if ('CRIADO_POR' in ctx.idx) o.CRIADO_POR = email;
        return ctx.cab.map(function (n) {
          const v = o[String(n).trim()];
          return (v === undefined || v === null) ? '' : v;
        });
      });

      if (linhas.length) {
        ctx.sheet.getRange(ctx.sheet.getLastRow() + 1, 1, linhas.length, ctx.cab.length)
                 .setValues(linhas);
      }
      invalidar(tabela);
      return linhas.length;
    } finally {
      lock.releaseLock();
    }
  }

  /** Diferença campo a campo — é o que alimenta o LOG_ATIV. */
  function diferenca(antes, depois, cab) {
    const ignorar = ['ALTERADO_EM', 'ALTERADO_POR', 'VERSAO', 'CRIADO_EM', 'CRIADO_POR'];
    const d = [];
    cab.forEach(function (n) {
      const nome = String(n).trim();
      if (ignorar.indexOf(nome) >= 0) return;
      const a = antes ? antes[nome] : '';
      const b = depois[nome];
      if (String(a === undefined ? '' : a) !== String(b === undefined ? '' : b)) {
        d.push({ campo: nome, antes: a, depois: b });
      }
    });
    return d;
  }

  return {
    abrir: abrir, listar: listar, achar: achar, salvar: salvar,
    inativar: inativar, inserirLote: inserirLote, invalidar: invalidar, ss: ss
  };
})();

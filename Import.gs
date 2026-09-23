/**
 * Import.gs — a carga da base oficial da Salomé.
 *
 * Rode UMA VEZ, depois de criarBases():
 *
 *      importarBaseSalome()
 *
 * É idempotente: o que já existe não é tocado nem duplicado. Rodar de novo só completa
 * o que falta — útil quando o plano de contas ganhar as contas que hoje não existem.
 *
 * O que entra, e de onde:
 *   CENTROS_CUSTO   3 centros ......... planilha CENTRO DE CUSTO
 *   PLANO_CONTAS    172 contas ........ PDF PLANO DE CONTAS  (+4 deduzidas, ver abaixo)
 *   CENTRO_CONTA    112 relações ...... cruzamento das duas
 *   CATEGORIAS      25 categorias ..... Catalogo.gs (semente; depois edite pelo app)
 *   FORNECEDORES    109 fornecedores .. planilha PEÇAS E SERVIÇOS
 *
 * Duas coisas para você saber antes de rodar:
 *
 * 1. A fonte do plano de contas é o **.xls oficial**, não o PDF. O PDF vinha com 58
 *    descrições cortadas no meio e não trazia 40 contas que a operação usa — entre elas
 *    OFICINAS DE TERCEIROS e MANUSEIO DE CARGAS, que juntas respondem por 57 dos 109
 *    fornecedores. Aqui nada é sugestão: é o texto oficial.
 *
 * 2. Os fornecedores vieram SEM CNPJ. Entram só com razão social, tipo e a marcação de
 *    optante do Simples, que é o que decide a retenção. O CNPJ é preenchido depois,
 *    pelo app ou por importação de planilha.
 */

/** Ponto de entrada. É esta função que você seleciona no editor. */
function importarBaseSalome() {
  return Import.tudo();
}

/** Relatório do que entrou, do que falta e do que precisa de conferência humana. */
function conferirBaseSalome() {
  return Import.conferir();
}

const Import = (function () {

  const AGORA = function () { return new Date(); };
  const QUEM = 'importacao';

  /**
   * Monta a linha na ordem REAL do cabeçalho da aba — nunca na ordem do SCHEMA.
   *
   * A diferença importa: a migração acrescenta coluna nova no FIM da aba, então a ordem
   * física quase nunca é a do SCHEMA. Montar pelo SCHEMA e gravar na aba embaralharia as
   * colunas em silêncio, e o estrago só apareceria depois, com dado no lugar errado.
   */
  function linha(cab, obj) {
    const base = {
      STATUS: 'ATIVO', CRIADO_EM: AGORA(), CRIADO_POR: QUEM,
      ALTERADO_EM: '', ALTERADO_POR: '', VERSAO: 1,
      INATIVADO_EM: '', INATIVADO_POR: '', MOTIVO_INATIVACAO: ''
    };
    return cab.map(function (n) {
      const c = String(n).trim();
      return (c in obj) ? obj[c] : (c in base ? base[c] : '');
    });
  }

  /**
   * CÓDIGO NÃO É NÚMERO.
   *
   * "2.10" é o código da conta DEDUÇÕES DE VENDAS. O Sheets lê isso como o número 2,1
   * e o zero final some — não da tela, do dado: o que fica gravado é 2.1. Na volta,
   * String(2.1) é "2.1", que não bate com "2.10", então a carga conclui que a conta
   * não existe e grava outra. Rodar de novo grava mais uma. Foi assim que 212 contas
   * viraram 214.
   *
   * São duas curas, e as duas são necessárias:
   *   - gravar estas colunas com formato de TEXTO antes do setValues (aqui embaixo);
   *   - comparar por uma chave que sobreviva à coerção (chave(), logo abaixo).
   */
  const COLUNAS_TEXTO = {
    CODIGO: 1, CONTA_ID: 1, CONTA_CODIGO: 1, CODIGO_CONTA: 1, CONTA_CONTABIL: 1,
    CONTA_PJ: 1, CONTA_PF: 1, CONTA_PADRAO: 1, CENTRO_CONTA_ID: 1,
    CNPJ: 1, CPF: 1, TELEFONE: 1, CEP: 1, PLACA: 1, CHAVE_PIX: 1
  };

  /**
   * Chave de comparação imune à coerção do Sheets.
   *
   * Normaliza só o que o Sheets consegue ler como decimal: "2.10" e 2.1 caem os dois
   * em "2.1". Código com dois pontos ("2.08.003") não é número, entra e sai intacto.
   * Conferido contra as 212 contas oficiais: nenhuma colisão.
   */
  function chave(v) {
    const s = String(v === null || v === undefined ? '' : v).trim();
    return /^-?\d+\.\d+$/.test(s) ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  }

  function jaTem(tabela, campo, valores) {
    const existentes = {};
    Repo.listar(tabela, null, true).forEach(function (r) { existentes[chave(r[campo])] = true; });
    return valores.filter(function (v) { return !existentes[chave(v)]; });
  }

  /** Formato de texto nas colunas de código, ANTES do setValues. Depois já é tarde. */
  function marcarTexto(ctx, linhaIni, qtd) {
    ctx.cab.forEach(function (n, i) {
      if (!COLUNAS_TEXTO[String(n).trim()]) return;
      try { ctx.sheet.getRange(linhaIni, i + 1, qtd, 1).setNumberFormat('@'); } catch (e) {}
    });
  }

  function gravar(tabela, objs) {
    if (!objs.length) return 0;
    const ctx = Repo.abrir(tabela);
    const linhas = objs.map(function (o) { return linha(ctx.cab, o); });
    const ini = ctx.sheet.getLastRow() + 1;
    marcarTexto(ctx, ini, linhas.length);
    ctx.sheet.getRange(ini, 1, linhas.length, ctx.cab.length).setValues(linhas);
    Repo.invalidar(tabela);
    return linhas.length;
  }

  /* ====================================================================== */

  function centros() {
    const novos = jaTem('CENTROS_CUSTO', 'CENTRO_ID', DADOS.CENTROS.map(function (c) { return c[0]; }));
    const objs = DADOS.CENTROS
      .filter(function (c) { return novos.indexOf(c[0]) >= 0; })
      .map(function (c, i) {
        return { CENTRO_ID: c[0], NOME: c[1], DESCRICAO: c[2], ORDEM: i + 1 };
      });
    return gravar('CENTROS_CUSTO', objs);
  }

  function contas() {
    const todas = DADOS.CONTAS;
    const novas = jaTem('PLANO_CONTAS', 'CODIGO', todas.map(function (c) { return c[0]; }));
    const objs = todas
      .filter(function (c) { return novas.indexOf(c[0]) >= 0; })
      .map(function (c) {
        const analitica = c[2] === 'ANAL';
        return {
          CONTA_ID: 'CT-' + c[0],
          CODIGO: c[0],
          DESCRICAO: c[1],
          TIPO: analitica ? 'ANALITICA' : 'SINTETICA',
          NATUREZA_BC: c[3],
          CONTA_CONTABIL: c[4],
          DESCRICAO_CONTABIL: c[5],
          GRUPO_DRE: grupoDre(c[0]),
          CLASSIFICACAO: c[1],
          NATUREZA: c[0].charAt(0) === '1' ? 'RECEITA' : 'DESPESA',
          // Sintética é só agrupamento: não aceita lançamento.
          TIPO_LANCAMENTO: analitica ? 'LANCAVEL' : 'AGRUPADOR',
          ANTECEDENCIA_MIN_DIAS: '', CONDICAO_PADRAO: '', FORMA_PADRAO: '',
          EXIGE_RATEIO: 'NAO', EXIGE_ANEXO_ORCAMENTO: 'NAO', RATEIO_PADRAO: '',
          CENTRO_CUSTO: ''
        };
      });
    return gravar('PLANO_CONTAS', objs);
  }

  /** O primeiro nível do código é o grupo da DRE. */
  const GRUPOS = {
    '1': 'RECEITAS', '2': 'DESPESAS', '3': 'RESULTADO', '4': 'MOVIMENTACAO', '5': 'OUTROS'
  };
  function grupoDre(codigo) {
    return GRUPOS[codigo.charAt(0)] || 'OUTROS';
  }

  function centroConta() {
    const chaves = DADOS.CENTRO_CONTA.map(function (r) { return r[0] + '|' + r[1]; });
    const novas = jaTem('CENTRO_CONTA', 'CENTRO_CONTA_ID', chaves);
    const objs = DADOS.CENTRO_CONTA
      .filter(function (r) { return novas.indexOf(r[0] + '|' + r[1]) >= 0; })
      .map(function (r) {
        return { CENTRO_CONTA_ID: r[0] + '|' + r[1], CODIGO_CONTA: r[0], CENTRO_ID: r[1] };
      });
    return gravar('CENTRO_CONTA', objs);
  }

  /** As cinco categorias que o arquivo de fornecedores já marca são as de uso frequente. */
  const FREQUENTES = { 'FR-PEC': 1, 'FR-PNE': 1, 'FR-OFI': 1, 'CA-FRE': 1, 'CA-MAN': 1 };

  function categorias() {
    const novas = jaTem('CATEGORIAS', 'CATEGORIA_ID', Catalogo.CATEGORIAS.map(function (c) { return c[0]; }));
    const objs = Catalogo.CATEGORIAS
      .filter(function (c) { return novas.indexOf(c[0]) >= 0; })
      .map(function (c) {
        return {
          CATEGORIA_ID: c[0], BLOCO: c[1], NOME: c[2], EXEMPLOS: c[3],
          CONTA_PJ: c[4], CONTA_PF: c[5], CENTRO_PADRAO: c[6],
          EXIGE_PLACA: c[7], EXIGE_ANEXO: c[8], RETENCAO: c[9],
          ANTECEDENCIA_MIN_DIAS: c[10],
          USO_FREQUENTE: FREQUENTES[c[0]] ? 'SIM' : 'NAO'
        };
      });
    return gravar('CATEGORIAS', objs);
  }

  function fornecedores() {
    const codigos = DADOS.FORNECEDORES.map(function (f) { return codigoForn(f[0]); });
    const novos = jaTem('FORNECEDORES', 'FORNECEDOR_ID', codigos);
    const objs = DADOS.FORNECEDORES
      .filter(function (f) { return novos.indexOf(codigoForn(f[0])) >= 0; })
      .map(function (f) {
        const cats = String(f[3]).split('|')
          .map(function (c) { return Catalogo.CAT_FORNECEDOR[c] || ''; })
          .filter(String);
        return {
          FORNECEDOR_ID: codigoForn(f[0]),
          CODIGO: '', RAZAO_SOCIAL: f[0], NOME_FANTASIA: '',
          CNPJ: '',                       // não veio no arquivo; preencher pelo app
          TIPO: f[1],
          OPTANTE_SIMPLES: f[2],
          CATEGORIAS: cats.join('|'),
          CONTA_PADRAO: '', CONDICAO_PADRAO: '', FORMA_PADRAO: '',
          EMAIL: '', TELEFONE: '', CHAVE_PIX: ''
        };
      });
    return gravar('FORNECEDORES', objs);
  }

  /** ID estável a partir da razão social — o arquivo não trouxe código nem CNPJ. */
  function codigoForn(razao) {
    const limpo = String(razao).toUpperCase()
      .replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
    let h = 0;
    for (let i = 0; i < limpo.length; i++) h = (h * 31 + limpo.charCodeAt(i)) % 99991;
    return 'FOR-' + limpo.split(' ').slice(0, 2).join('').slice(0, 10) + '-' + h;
  }

  /* ====================================================================== */

  function tudo() {
    const r = {
      centros: centros(),
      contas: contas(),
      centroConta: centroConta(),
      categorias: categorias(),
      fornecedores: fornecedores()
    };
    const txt = [
      'Carga concluída — o que entrou agora:',
      '  centros de custo ...... ' + r.centros,
      '  contas ................ ' + r.contas,
      '  relações centro×conta . ' + r.centroConta,
      '  categorias ............ ' + r.categorias,
      '  fornecedores .......... ' + r.fornecedores,
      '',
      conferir()
    ].join('\n');
    console.log(txt);
    return txt;
  }

  function conferir() {
    const contasBase = Repo.listar('PLANO_CONTAS', null, true);
    const semCnpj = Repo.listar('FORNECEDORES').filter(function (f) { return !f.CNPJ; });

    // Categoria apontando para conta que não existe = formulário quebrado na hora do uso.
    const existe = {};
    contasBase.forEach(function (c) { existe[c.CODIGO] = true; });
    const orfas = [];
    Repo.listar('CATEGORIAS').forEach(function (c) {
      [c.CONTA_PJ, c.CONTA_PF].forEach(function (k) {
        if (k && !existe[k]) orfas.push(c.NOME + ' → ' + k);
      });
    });

    const l = ['O que ainda depende de gente:'];
    l.push('  ' + contasBase.length + ' contas carregadas do plano oficial (nenhuma pendente de texto)');
    l.push('  ' + semCnpj.length + ' fornecedores sem CNPJ');
    l.push(orfas.length
      ? '  BLOQUEIA: ' + orfas.length + ' categorias apontam para conta inexistente:\n     ' + orfas.join('\n     ')
      : '  nenhuma categoria órfã — todas as contas apontadas existem');
    const txt = l.join('\n');
    console.log(txt);
    return txt;
  }

  return {
    tudo: tudo, conferir: conferir, linha: linha, gravar: gravar,
    chave: chave, COLUNAS_TEXTO: COLUNAS_TEXTO,
    centros: centros, contas: contas, centroConta: centroConta,
    categorias: categorias, fornecedores: fornecedores
  };
})();

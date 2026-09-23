/**
 * Migrar.gs — põe a planilha existente no formato da versão nova, sem perder nada.
 *
 *      migrarEstrutura()
 *
 * POR QUE ISTO EXISTE
 * `criarBases()` só escreve o cabeçalho quando a aba está vazia. Foi feito assim de
 * propósito — é o que impede uma execução distraída de esmagar dados. O preço é que
 * abas que já existem NÃO ganham as colunas novas de uma versão posterior, e o app
 * quebra procurando coluna que não está lá.
 *
 * O QUE ESTA FUNÇÃO FAZ
 *   1. cria as abas que faltam, com o cabeçalho do SCHEMA
 *   2. ACRESCENTA no fim de cada aba existente as colunas que o SCHEMA tem e ela não
 *   3. completa os parâmetros e as permissões que entraram depois da carga original
 *
 * O QUE ELA NUNCA FAZ
 *   - não apaga aba, linha nem coluna
 *   - não renomeia nem reordena coluna existente
 *   - não toca em dado nenhum
 *
 * Coluna nova entra no FIM, e não na posição do SCHEMA. Isso é seguro porque o `Repo`
 * localiza coluna pelo NOME, nunca pela posição — é exatamente para isto que essa regra
 * existe desde o primeiro dia.
 *
 * É idempotente: rodar de novo não faz nada além de dizer que está tudo no lugar.
 */

/** Ponto de entrada. É esta função que você seleciona no editor. */
function migrarEstrutura() {
  return Migrar.tudo();
}

/** Só olha e relata, sem escrever nada. Rode antes se quiser ver o estrago. */
function conferirEstrutura() {
  return Migrar.conferir();
}

/** Relatório das tabelas de carga: duplicados e linhas com cara de importação torta. */
function conferirCarga() {
  return Migrar.conferirCarga();
}

/** Tira o lixo que sobrou de importação interrompida. Não toca em movimento. */
function repararCarga() {
  return Migrar.repararCarga();
}

const Migrar = (function () {

  function planilha(pl) {
    const id = Cfg.prop(pl === 'FC_LOG' ? 'ID_FC_LOG' : 'ID_FC_DADOS');
    if (!id) throw new Error('A planilha ' + pl + ' não está configurada. Rode criarBases() antes.');
    return SpreadsheetApp.openById(id);
  }

  /**
   * As abas do FC_LOG ficam de fora: 'LOG_ACESSO_AAAA-Sww' é um MODELO, não uma aba.
   * A aba real é 'LOG_ACESSO_2026-S39', criada pelo Log.gs na semana em que for usada.
   * Criar o modelo aqui geraria uma aba de lixo com o nome literal.
   */
  function tabelasDe(pl) {
    return Object.keys(SCHEMA).filter(function (t) {
      return SCHEMA[t].pl === pl && t.indexOf('AAAA-Sww') < 0;
    });
  }

  function cabecalhoDe(sheet) {
    if (sheet.getLastRow() === 0) return [];
    return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
                .map(function (v) { return String(v).trim(); })
                .filter(String);
  }

  /* ====================================================================== */

  function conferir() {
    const l = ['Estrutura — o que está fora do lugar:', ''];
    let problemas = 0;

    ['FC_DADOS'].forEach(function (pl) {
      let ss;
      try { ss = planilha(pl); } catch (e) { l.push('  ' + e.message); problemas++; return; }
      const tabelas = tabelasDe(pl);

      tabelas.forEach(function (t) {
        const sh = ss.getSheetByName(t);
        if (!sh) { l.push('  FALTA A ABA  ' + t); problemas++; return; }
        const atual = cabecalhoDe(sh);
        const faltam = SCHEMA[t].cols.filter(function (c) { return atual.indexOf(c) < 0; });
        const sobram = atual.filter(function (c) { return SCHEMA[t].cols.indexOf(c) < 0; });
        if (faltam.length) { l.push('  ' + t + ' — faltam colunas: ' + faltam.join(', ')); problemas++; }
        if (sobram.length) { l.push('  ' + t + ' — colunas a mais (serão mantidas): ' + sobram.join(', ')); }
      });
    });

    const par = pendenciasParametros();
    if (par.length) { l.push('  PARAMETROS — faltam: ' + par.map(function (p) { return p[0]; }).join(', ')); problemas++; }
    const per = pendenciasPermissoes();
    if (per.length) { l.push('  PERMISSOES — faltam ' + per.length + ' linhas de perfil × recurso'); problemas++; }

    if (!problemas) l.push('  nada. A estrutura está igual ao SCHEMA.');
    const txt = l.join('\n');
    console.log(txt);
    return txt;
  }

  /* ====================================================================== */

  function tudo() {
    const r = { abasCriadas: [], colunasAdicionadas: [], parametros: 0, permissoes: 0 };

    ['FC_DADOS'].forEach(function (pl) {
      const ss = planilha(pl);
      const tabelas = tabelasDe(pl);

      tabelas.forEach(function (t) {
        const cols = SCHEMA[t].cols;
        let sh = ss.getSheetByName(t);

        if (!sh) {
          sh = ss.insertSheet(t);
          sh.getRange(1, 1, 1, cols.length).setValues([cols]);
          formatar(sh, cols.length);
          r.abasCriadas.push(t);
          return;
        }

        const atual = cabecalhoDe(sh);
        if (!atual.length) {                      // aba existe mas está sem cabeçalho
          sh.getRange(1, 1, 1, cols.length).setValues([cols]);
          formatar(sh, cols.length);
          r.abasCriadas.push(t + ' (cabeçalho)');
          return;
        }

        const faltam = cols.filter(function (c) { return atual.indexOf(c) < 0; });
        if (faltam.length) {
          // Entram no FIM. O Repo acha coluna pelo nome, então a posição não importa.
          sh.getRange(1, atual.length + 1, 1, faltam.length).setValues([faltam]);
          formatar(sh, atual.length + faltam.length);
          r.colunasAdicionadas.push(t + ': ' + faltam.join(', '));
        }
      });
    });

    r.parametros  = completarParametros();
    r.permissoes  = completarPermissoes();
    r.filiais     = completarFiliais();
    r.areas       = completarAreas();

    // O cache guarda o formato antigo das linhas. Sem limpar, o app continua vendo o velho.
    try { CacheService.getScriptCache().removeAll(
      Object.keys(SCHEMA).map(function (t) { return 'T_' + t; })); } catch (e) { /* ok */ }

    const txt = [
      'Migração concluída.',
      '  abas criadas ......... ' + (r.abasCriadas.length ? r.abasCriadas.join(', ') : 'nenhuma'),
      '  colunas acrescentadas: ' + (r.colunasAdicionadas.length ? '' : 'nenhuma'),
      r.colunasAdicionadas.map(function (x) { return '     ' + x; }).join('\n'),
      '  parâmetros novos ..... ' + r.parametros,
      '  permissões novas ..... ' + r.permissoes,
      '  filiais .............. ' + r.filiais,
      '  áreas ................ ' + r.areas,
      '',
      'Nada foi apagado. Agora rode importarBaseSalome().'
    ].filter(String).join('\n');
    console.log(txt);
    return txt;
  }

  function formatar(sh, n) {
    sh.getRange(1, 1, 1, n)
      .setFontWeight('bold').setBackground('#003A5E').setFontColor('#FFFFFF')
      .setFontSize(9).setVerticalAlignment('middle');
    sh.setFrozenRows(1);
    sh.setRowHeight(1, 28);
  }

  /* ---------- parâmetros que entraram depois ---------- */

  const PARAMETROS_NOVOS = [
    ['RET_IRRF_PJ', '1.5', 'NUMERO', 'IRRF sobre serviço de PJ não optante do Simples (%)', 'FINANCEIRO'],
    ['RET_CSRF_PJ', '4.65', 'NUMERO', 'PIS/COFINS/CSLL sobre serviço de PJ, acima do piso (%)', 'FINANCEIRO'],
    ['RET_ISS', '0', 'NUMERO', 'ISS retido — depende do município do serviço (%)', 'FINANCEIRO'],
    ['RET_INSS_PF', '11', 'NUMERO', 'INSS retido de prestador pessoa física (%)', 'FINANCEIRO'],
    ['RET_INSS_FRETE_PF', '11', 'NUMERO', 'INSS do frete de autônomo, sobre 20% do frete (%)', 'FINANCEIRO'],
    ['RET_SEST_SENAT', '2.5', 'NUMERO', 'SEST/SENAT do frete de autônomo, sobre 20% do frete (%)', 'FINANCEIRO']
  ];

  function pendenciasParametros() {
    const tem = {};
    Repo.listar('PARAMETROS', null, true).forEach(function (p) { tem[p.CHAVE] = true; });
    return PARAMETROS_NOVOS.filter(function (p) { return !tem[p[0]]; });
  }

  function completarParametros() {
    const novos = pendenciasParametros();
    if (novos.length) escrever('PARAMETROS', novos.map(function (p) {
      return { CHAVE: p[0], VALOR: p[1], TIPO: p[2], DESCRICAO: p[3], PERFIL_QUE_ALTERA: p[4] };
    }));
    // VERSAO_APP existe desde o começo: aqui é atualização, não inserção.
    const v = Repo.achar('PARAMETROS', 'CHAVE', 'VERSAO_APP');
    if (v && String(v.VALOR) !== '1.0.4') { v.VALOR = '1.0.4'; Repo.salvar('PARAMETROS', v, null, { forcar: true }); }
    return novos.length;
  }

  /* ---------- permissões dos recursos novos ---------- */

  function pendenciasPermissoes() {
    const tem = {};
    Repo.listar('PERMISSOES', null, true).forEach(function (p) { tem[p.PERFIL_ID + '|' + p.RECURSO] = true; });
    return Setup.permissoesPadrao().filter(function (l) { return !tem[l[0] + '|' + l[1]]; });
  }

  function completarPermissoes() {
    const novas = pendenciasPermissoes();
    if (!novas.length) return 0;
    const cols = SCHEMA.PERMISSOES.cols;
    escrever('PERMISSOES', novas.map(function (l) {
      const o = {};
      l.forEach(function (v, i) { if (cols[i]) o[cols[i]] = v; });
      return o;
    }));
    return novas.length;
  }

  /* ---------- limpeza de carga interrompida ---------- */

  /**
   * As tabelas de CARGA são derivadas de arquivo: plano de contas, categorias, centros,
   * relações e fornecedores. Se uma importação morre no meio, sobra linha repetida — e,
   * se ela morreu na versão que gravava na ordem errada, sobra linha com os valores
   * deslocados de coluna.
   *
   * Movimento (solicitações, títulos, aprovações, rateio, log) NUNCA entra aqui. Ali a
   * regra continua sendo inativar, nunca apagar.
   */
  const TABELAS_DE_CARGA = [
    { t: 'PLANO_CONTAS',  chave: 'CODIGO' },
    { t: 'CATEGORIAS',    chave: 'CATEGORIA_ID' },
    { t: 'CENTROS_CUSTO', chave: 'CENTRO_ID' },
    { t: 'CENTRO_CONTA',  chave: 'CENTRO_CONTA_ID' },
    { t: 'FORNECEDORES',  chave: 'FORNECEDOR_ID' }
  ];

  function analisar(def) {
    const ctx = Repo.abrir(def.t);
    const iCh = ctx.idx[def.chave];
    const vistos = {}, dup = [], semChave = [];

    for (let i = 1; i < ctx.valores.length; i++) {
      const linha = ctx.valores[i];
      if (linha.join('') === '') continue;
      // Pela chave normalizada: assim "2.10" em texto e 2.1 em número são reconhecidos
      // como a MESMA conta, que é o estado misto que a carga antiga deixava.
      const v = Import.chave(linha[iCh]);
      if (!v) { semChave.push(i + 1); continue; }
      if (vistos[v]) dup.push({ linha: i + 1, chave: String(linha[iCh]) });
      else vistos[v] = i + 1;
    }
    return { ctx: ctx, dup: dup, semChave: semChave, unicos: Object.keys(vistos).length };
  }

  function conferirCarga() {
    const l = ['Tabelas de carga:', ''];
    let problemas = 0;
    TABELAS_DE_CARGA.forEach(function (def) {
      let a;
      try { a = analisar(def); } catch (e) { l.push('  ' + def.t + ' — ' + e.message); problemas++; return; }
      const total = a.unicos + a.dup.length + a.semChave.length;
      l.push('  ' + def.t + ': ' + total + ' linhas, ' + a.unicos + ' ' + def.chave + ' distintos');
      if (a.dup.length) {
        problemas++;
        l.push('     ' + a.dup.length + ' repetidas — linhas ' +
               a.dup.slice(0, 12).map(function (d) { return d.linha + '(' + d.chave + ')'; }).join(', ') +
               (a.dup.length > 12 ? ' …' : ''));
      }
      if (a.semChave.length) {
        problemas++;
        l.push('     ' + a.semChave.length + ' sem ' + def.chave +
               ' — provável gravação com colunas deslocadas: linhas ' + a.semChave.slice(0, 12).join(', '));
      }
    });
    l.push('');
    l.push(problemas ? 'Rode repararCarga() para limpar.' : 'Nada a reparar.');
    const txt = l.join('\n');
    console.log(txt);
    return txt;
  }

  /**
   * Colunas que guardam CÓDIGO e precisam viver como TEXTO na aba.
   *
   * Ver a explicação longa em Import.gs: "2.10" lido como número vira 2.1 e o zero
   * não volta sozinho. O Import.gs corrigido já grava certo daqui para a frente —
   * esta função é para o que JÁ está gravado errado.
   */
  const COLUNAS_CODIGO = {
    PLANO_CONTAS:  ['CODIGO', 'CONTA_ID', 'CONTA_CONTABIL'],
    CENTRO_CONTA:  ['CENTRO_CONTA_ID', 'CODIGO_CONTA'],
    CATEGORIAS:    ['CONTA_PJ', 'CONTA_PF'],
    FORNECEDORES:  ['CNPJ', 'CODIGO'],
    CENTROS_CUSTO: []
  };

  /**
   * Devolve a coluna ao formato texto e reescreve o valor com a grafia oficial.
   *
   * Formatar sozinho não resolve: formato é aparência, e o 2.1 gravado continua 2.1.
   * Tem de reescrever o valor — e, para o valor não ser reconvertido na hora, o
   * formato tem de ir primeiro. É nesta ordem, e só nesta ordem, que funciona.
   */
  function corrigirCodigos() {
    const oficial = {};                     // chave normalizada -> grafia do arquivo oficial
    DADOS.CONTAS.forEach(function (c) { oficial[Import.chave(c[0])] = String(c[0]); });

    const l = [];
    Object.keys(COLUNAS_CODIGO).forEach(function (t) {
      let ctx;
      try { ctx = Repo.abrir(t); } catch (e) { l.push('  ' + t + ': ' + e.message); return; }
      const ult = ctx.sheet.getLastRow();
      if (ult < 2) { l.push('  ' + t + ': aba vazia'); return; }

      let mexeu = 0, retexto = 0;
      COLUNAS_CODIGO[t].forEach(function (nome) {
        const i = ctx.idx[nome];
        if (i === undefined) return;
        const col = i + 1, qtd = ult - 1;

        ctx.sheet.getRange(2, col, qtd, 1).setNumberFormat('@');
        const vals = ctx.sheet.getRange(2, col, qtd, 1).getValues();
        const novos = vals.map(function (r) {
          const v = r[0];
          if (v === '' || v === null || v === undefined) return [''];
          const s = String(v);
          const certo = oficial[Import.chave(v)];
          if (certo && certo !== s) { mexeu++; return [certo]; }
          if (typeof v === 'number') { retexto++; return [s]; }
          return [s];
        });
        ctx.sheet.getRange(2, col, qtd, 1).setValues(novos);
      });

      Repo.invalidar(t);
      l.push('  ' + t + ': ' + mexeu + ' código(s) com grafia restaurada, ' +
             retexto + ' número(s) devolvido(s) a texto');
    });
    return l;
  }

  function repararCarga() {
    const l = ['Reparo das tabelas de carga:', ''];
    let removidas = 0;

    TABELAS_DE_CARGA.forEach(function (def) {
      const a = analisar(def);
      const alvo = a.dup.map(function (d) { return d.linha; }).concat(a.semChave);
      if (!alvo.length) { l.push('  ' + def.t + ': nada a remover'); return; }

      // De baixo para cima: apagar de cima muda o número das linhas de baixo.
      alvo.sort(function (x, y) { return y - x; }).forEach(function (n) { a.ctx.sheet.deleteRow(n); });
      Repo.invalidar(def.t);
      removidas += alvo.length;
      l.push('  ' + def.t + ': ' + alvo.length + ' linhas removidas (' +
             a.dup.length + ' repetidas, ' + a.semChave.length + ' sem chave)');
    });

    // A limpeza vem primeiro, a grafia depois: reescrever o código de uma linha que
    // ainda tem duas cópias só espalharia o problema.
    l.push('');
    l.push('Códigos:');
    corrigirCodigos().forEach(function (x) { l.push(x); });

    l.push('');
    l.push(removidas
      ? removidas + ' linhas de carga removidas. Rode importarBaseSalome() para recompor o que faltar.'
      : 'Nada foi removido.');
    const txt = l.join('\n');
    console.log(txt);
    return txt;
  }

  /* ---------- semente mínima para o formulário abrir ---------- */

  /**
   * Sem filial e sem área o formulário de solicitação abre com dois selects vazios e
   * ninguém consegue lançar nada. Estas são as quatro unidades da Salomé e as áreas que
   * apareceram na reunião — semente, não verdade absoluta: edite pelo app à vontade.
   * Só entram se a aba estiver VAZIA; nunca sobrescrevem um cadastro existente.
   */
  function completarFiliais() {
    if (Repo.listar('FILIAIS', null, true).length) return 0;
    const f = [
      ['RP',  'RP',  'Rio Preto (Matriz)', 'SP', 'MATRIZ', 'ADM'],
      ['CPQ', 'CPQ', 'Campinas',           'SP', 'FILIAL', 'OPE'],
      ['OSA', 'OSA', 'Osasco',             'SP', 'FILIAL', 'OPE'],
      ['SPO', 'SPO', 'São Paulo',          'SP', 'FILIAL', 'OPE']
    ];
    escrever('FILIAIS', f.map(function (x) {
      return { FILIAL_ID: x[0], CODIGO: x[1], NOME: x[2], UF: x[3], TIPO: x[4],
               CNPJ: '', CENTRO_CUSTO_PADRAO: x[5] };
    }));
    return f.length;
  }

  function completarAreas() {
    if (Repo.listar('AREAS', null, true).length) return 0;
    const a = ['Manutenção / Frota', 'Operação Armazém', 'Administrativo', 'TI', 'RH', 'Diretoria'];
    escrever('AREAS', a.map(function (n) {
      return { AREA_ID: n, NOME: n, RESPONSAVEL_EMAIL: '' };
    }));
    return a.length;
  }

  /** Escreve na ORDEM REAL do cabeçalho da aba, não na ordem do SCHEMA. */
  function escrever(tabela, objs) {
    if (!objs.length) return;
    const ctx = Repo.abrir(tabela);
    const linhas = objs.map(function (o) {
      return ctx.cab.map(function (n) {
        const k = String(n).trim();
        if (k in o) return o[k];
        if (k === 'STATUS') return 'ATIVO';
        if (k === 'CRIADO_EM') return new Date();
        if (k === 'CRIADO_POR') return 'migracao';
        if (k === 'VERSAO') return 1;
        return '';
      });
    });
    ctx.sheet.getRange(ctx.sheet.getLastRow() + 1, 1, linhas.length, ctx.cab.length).setValues(linhas);
    Repo.invalidar(tabela);
  }

  return { tudo: tudo, conferir: conferir, escrever: escrever,
           conferirCarga: conferirCarga, repararCarga: repararCarga,
           corrigirCodigos: corrigirCodigos };
})();

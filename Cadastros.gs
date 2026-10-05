/**
 * Cadastros.gs — manter os cadastros DIRETO NA PLANILHA.
 *
 * A decisão é do Kleber e é defensável: a equipe já sabe planilha, e uma tela de CRUD
 * a mais é uma tela a mais para manter. Mas planilha aceita qualquer coisa numa célula,
 * e é isso que este arquivo compensa. Quatro funções, e nada aqui é automático — tudo
 * roda quando você mandar.
 *
 *   prepararPlanilha()     uma vez. Põe listas suspensas, formato de texto onde precisa,
 *                          e cria a coluna SENHA_NOVA na aba USUARIOS.
 *   aplicarSenhas()        depois de digitar senha nova. Gera o hash, apaga a senha da
 *                          célula e completa o que faltava nas linhas novas.
 *   conferirCadastros()    o rede de segurança. Diz o que a planilha deixou passar.
 *   recarregarCadastros()  o app guarda cadastro em cache por 10 minutos. Isto derruba
 *                          o cache e faz a edição aparecer na hora.
 *
 * O que NÃO fazer na planilha, e vale repetir: **apagar linha**. Fornecedor apagado
 * continua sendo apontado por toda solicitação antiga, e o que era um nome vira um código
 * órfão no relatório de dois anos atrás. Para tirar de circulação, escreva INATIVO na
 * coluna STATUS — o app para de oferecer, e o histórico continua legível.
 */

/* ============ ATALHOS PARA O MENU "Executar" DO EDITOR ============ */

/** Uma vez, antes de começar a editar a planilha na mão. */
function prepararPlanilha()    { return Cadastros.preparar(); }

/** Depois de digitar senha na coluna SENHA_NOVA. */
function aplicarSenhas()       { return Cadastros.aplicarSenhas(); }

/** O que a planilha deixou passar. Só lê, não altera nada. */
function conferirCadastros()   { return Cadastros.conferir(); }

/** Derruba o cache: a edição da planilha aparece no app na hora. */
function recarregarCadastros() { return Cadastros.recarregar(); }

/** Instala o menu "FC Salomé" dentro da planilha, para não precisar abrir o editor. */
function instalarMenu()        { return Cadastros.instalarMenu(); }

/** Os endereços das duas planilhas. Guarde nos favoritos. */
function linksDasPlanilhas()   { return Cadastros.links(); }


const Cadastros = (function () {

  /**
   * As abas que se mantêm na mão, e o que valida cada uma.
   *
   * `obrigatorias` é o mínimo para a linha servir para alguma coisa. `listas` são as
   * colunas que viram lista suspensa: coluna com lista não aceita "Diretoria" onde o
   * sistema espera "DIRETORIA", e esse erro de maiúscula é o que cria usuário sem
   * permissão nenhuma sem ninguém entender por quê.
   */
  const ABAS = {
    USUARIOS: {
      chave: 'USUARIO_ID',
      obrigatorias: ['NOME', 'LOGIN', 'PERFIL_ID'],
      unicas: ['LOGIN'],
      listas: { PERFIL_ID: 'PERFIS', ESCOPO_FILIAL: 'FILIAIS+TODAS', STATUS: 'STATUS' }
    },
    FORNECEDORES: {
      chave: 'FORNECEDOR_ID',
      obrigatorias: ['RAZAO_SOCIAL'],
      listas: { TIPO: ['PJ', 'PF'], OPTANTE_SIMPLES: ['SIM', 'NAO'], STATUS: 'STATUS' }
    },
    CATEGORIAS: {
      chave: 'CATEGORIA_ID',
      obrigatorias: ['NOME', 'CONTA_PJ'],
      listas: { EXIGE_PLACA: ['SIM', 'NAO'], EXIGE_ANEXO: ['SIM', 'NAO'],
                USO_FREQUENTE: ['SIM', 'NAO'], STATUS: 'STATUS' }
    },
    PLANO_CONTAS: {
      chave: 'CODIGO',
      obrigatorias: ['DESCRICAO'],
      listas: { TIPO: ['ANALITICA', 'SINTETICA'], TIPO_LANCAMENTO: ['LANCAVEL', 'AGRUPADOR'],
                NATUREZA: ['RECEITA', 'DESPESA'], EXIGE_RATEIO: ['SIM', 'NAO'],
                EXIGE_ANEXO_ORCAMENTO: ['SIM', 'NAO'], STATUS: 'STATUS' }
    },
    FILIAIS:        { chave: 'FILIAL_ID', obrigatorias: ['NOME'], listas: { STATUS: 'STATUS' } },
    AREAS:          { chave: 'AREA_ID',   obrigatorias: ['NOME'], listas: { STATUS: 'STATUS' } },
    CENTROS_CUSTO:  { chave: 'CENTRO_ID', obrigatorias: ['NOME'], listas: { STATUS: 'STATUS' } },
    ALCADAS:        { chave: 'ALCADA_ID', obrigatorias: ['NOME', 'LIMITE_ATE'],
                      listas: { PERFIL_APROVADOR: 'PERFIS', STATUS: 'STATUS' } },
    CONDICOES_PGTO: { chave: 'CONDICAO_ID', obrigatorias: ['NOME'], listas: { STATUS: 'STATUS' } },
    FORMAS_PGTO:    { chave: 'FORMA_ID',    obrigatorias: ['NOME'],
                      listas: { EXIGE_CHAVE: ['SIM', 'NAO'], STATUS: 'STATUS' } },
    PARAMETROS:     { chave: 'CHAVE',       obrigatorias: ['VALOR'] }
  };

  /**
   * Texto de uma célula, sem o truque do `|| ''`.
   *
   * `String(v || '')` transforma o número ZERO em string vazia, porque 0 é falso em
   * JavaScript. Numa aba de parâmetros isso vira "VALOR em branco" para toda alíquota
   * zerada — alarme falso que ensina a ignorar o relatório, que é o pior estrago
   * que um relatório pode fazer.
   */
  function celula(v) { return (v === null || v === undefined) ? '' : String(v).trim(); }

  /** A coluna onde você digita a senha provisória. Ela não faz parte do SCHEMA. */
  const COL_SENHA = 'SENHA_NOVA';

  /* ====================================================================== */
  /*  PREPARAR                                                              */
  /* ====================================================================== */

  /**
   * Deixa a planilha pronta para ser editada na mão.
   *
   * Roda quantas vezes quiser: nada aqui apaga dado. O que já está no lugar é conferido
   * e deixado como está.
   */
  function preparar() {
    const L = ['Planilha preparada para manutenção manual:', ''];

    const opcoes = {
      PERFIS: listaDe('PERFIS', 'PERFIL_ID'),
      FILIAIS: listaDe('FILIAIS', 'FILIAL_ID'),
      STATUS: ['ATIVO', 'INATIVO']
    };

    Object.keys(ABAS).forEach(function (t) {
      let ctx;
      try { ctx = Repo.abrir(t); } catch (e) { L.push('  ' + t + ' — ' + e.message); return; }

      const feito = [];

      // A coluna da senha só existe na USUARIOS, e é criada aqui porque não pertence ao
      // SCHEMA: ela é um campo de digitação, não um dado do sistema.
      if (t === 'USUARIOS' && ctx.idx[COL_SENHA] === undefined) {
        ctx.sheet.getRange(1, ctx.cab.length + 1).setValue(COL_SENHA);
        feito.push('coluna ' + COL_SENHA + ' criada');
        ctx = Repo.abrir(t);
      }
      // A coluna da senha é TEXTO, sempre. Uma senha como "007123" digitada numa célula
      // comum vira o número 7123 — e a pessoa passa a semana tentando entrar com a senha
      // que ela mesma escolheu, sem entender por quê.
      if (t === 'USUARIOS' && ctx.idx[COL_SENHA] !== undefined) {
        ctx.sheet.getRange(2, ctx.idx[COL_SENHA] + 1, Math.max(ctx.sheet.getMaxRows() - 1, 1), 1)
                 .setNumberFormat('@');
      }

      // Formato de texto nas colunas de código. Sem isto, "2.10" digitado na mão vira 2,1
      // de novo — o mesmo defeito que custou duas contas duplicadas na carga.
      let texto = 0;
      ctx.cab.forEach(function (n, i) {
        if (!Import.COLUNAS_TEXTO[String(n).trim()]) return;
        ctx.sheet.getRange(2, i + 1, Math.max(ctx.sheet.getMaxRows() - 1, 1), 1).setNumberFormat('@');
        texto++;
      });
      if (texto) feito.push(texto + ' coluna(s) de código em formato texto');

      // Listas suspensas.
      const listas = ABAS[t].listas || {};
      let dv = 0;
      Object.keys(listas).forEach(function (col) {
        const i = ctx.idx[col];
        if (i === undefined) return;
        const spec = listas[col];
        let valores;
        if (Array.isArray(spec)) valores = spec;
        else if (spec === 'STATUS') valores = opcoes.STATUS;
        else if (spec === 'PERFIS') valores = opcoes.PERFIS;
        else if (spec === 'FILIAIS+TODAS') valores = ['TODAS'].concat(opcoes.FILIAIS);
        if (!valores || !valores.length) return;

        // PERFIL_ID aceita combinação ("SOLICITANTE;FINANCEIRO"), então a lista aqui é
        // sugestão, não trava — senão não haveria como cadastrar quem tem dois chapéus.
        // Quem confere a combinação é o conferirCadastros().
        const solto = (col === 'PERFIL_ID' || col === 'ESCOPO_FILIAL');
        const regra = SpreadsheetApp.newDataValidation()
          .requireValueInList(valores, true)
          .setAllowInvalid(solto)
          .setHelpText(col + (solto
            ? ': escolha da lista, ou combine vários separando por ponto e vírgula — SOLICITANTE;FINANCEIRO.'
            : ': use uma das opções da lista.'))
          .build();
        ctx.sheet.getRange(2, i + 1, Math.max(ctx.sheet.getMaxRows() - 1, 1), 1)
                 .setDataValidation(regra);
        dv++;
      });
      if (dv) feito.push(dv + ' lista(s) suspensa(s)');

      ctx.sheet.setFrozenRows(1);
      L.push('  ' + t + ': ' + (feito.length ? feito.join(', ') : 'já estava pronta'));
    });

    L.push('');
    L.push('Duas regras para quem vai editar:');
    L.push('  1. Nunca apague linha. Escreva INATIVO na coluna STATUS.');
    L.push('  2. Não escreva nas colunas SENHA_HASH, SENHA_SALT nem nos IDs — são do sistema.');
    L.push('');
    L.push('Depois de editar, rode conferirCadastros() e recarregarCadastros().');

    const txt = L.join('\n');
    console.log(txt);
    return txt;
  }

  function listaDe(tabela, campo) {
    try {
      return Repo.listar(tabela, null, true)
        .map(function (r) { return celula(r[campo]); })
        .filter(String);
    } catch (e) { return []; }
  }

  /* ====================================================================== */
  /*  SENHAS                                                                */
  /* ====================================================================== */

  /**
   * Lê a coluna SENHA_NOVA, gera o hash e APAGA a célula.
   *
   * Por que a célula é apagada na mesma execução: senha em texto numa planilha é o tipo
   * de coisa que fica lá seis meses. Ela é provisória e a troca é obrigatória no primeiro
   * acesso, mas isso não é motivo para deixá-la à mostra. Apagar é parte do trabalho,
   * não um detalhe.
   *
   * A mesma passagem completa o que falta numa linha digitada do zero: o ID, a data de
   * criação e o STATUS. Sem isso o usuário existiria pela metade.
   */
  function aplicarSenhas() {
    const ctx = Repo.abrir('USUARIOS');
    const iSenha = ctx.idx[COL_SENHA];
    if (iSenha === undefined) {
      const aviso = 'A coluna ' + COL_SENHA + ' não existe. Rode prepararPlanilha() primeiro.';
      console.log(aviso);
      return aviso;
    }

    const perfis = listaDe('PERFIS', 'PERFIL_ID');
    const L = ['Senhas aplicadas:', ''];
    let feitas = 0, recusadas = 0;

    // De cima para baixo, mas guardando o número real da linha: quem edita na mão deixa
    // linha em branco no meio, e contar linha "cheia" daria o número errado.
    for (let i = 1; i < ctx.valores.length; i++) {
      const linha = ctx.valores[i];
      const nLinha = i + 1;
      const senha = celula(linha[iSenha]);
      if (!senha) continue;

      const nome  = celula(linha[ctx.idx.NOME]);
      const login = Auth.normalizarLogin(linha[ctx.idx.LOGIN]);
      const perfil = celula(linha[ctx.idx.PERFIL_ID]).toUpperCase();

      const erro = validarUsuario(nome, login, perfil, perfis, senha, ctx, i);
      if (erro) {
        L.push('  linha ' + nLinha + ' — RECUSADA: ' + erro);
        recusadas++;
        continue;
      }

      // Linha nova: o sistema completa o que é dele antes de definir a senha, porque o
      // Auth procura o usuário pelo ID.
      let id = celula(linha[ctx.idx.USUARIO_ID]);
      const novo = !id;
      if (novo) {
        id = Seq.proximo('USUARIOS');
        escrever(ctx, nLinha, 'USUARIO_ID', id);
        escrever(ctx, nLinha, 'LOGIN', login);
        escrever(ctx, nLinha, 'PERFIL_ID', perfil);
        if (!celula(linha[ctx.idx.ESCOPO_FILIAL])) escrever(ctx, nLinha, 'ESCOPO_FILIAL', 'TODAS');
        if (!celula(linha[ctx.idx.STATUS])) escrever(ctx, nLinha, 'STATUS', 'ATIVO');
        escrever(ctx, nLinha, 'LIMITE_ALCADA', Number(linha[ctx.idx.LIMITE_ALCADA] || 0));
        escrever(ctx, nLinha, 'TENTATIVAS_FALHA', 0);
        escrever(ctx, nLinha, 'CRIADO_EM', new Date());
        escrever(ctx, nLinha, 'CRIADO_POR', 'planilha');
        escrever(ctx, nLinha, 'VERSAO', 1);
      }
      Repo.invalidar('USUARIOS');

      try {
        Auth.definirSenha(id, senha, true);
      } catch (e) {
        L.push('  linha ' + nLinha + ' — RECUSADA: ' + e.message);
        recusadas++;
        continue;
      }

      // A senha sai da planilha agora, não depois.
      escrever(ctx, nLinha, COL_SENHA, '');
      feitas++;
      L.push('  linha ' + nLinha + ' — ' + (novo ? 'criado ' : 'senha trocada ') + id +
             ' · ' + nome + ' · ' + perfil + ' · login "' + login + '"');
    }

    Repo.invalidar('USUARIOS');
    L.push('');
    L.push(feitas + ' senha(s) aplicada(s), ' + recusadas + ' recusada(s).');
    if (feitas) L.push('Todas são provisórias: o app exige a troca no primeiro acesso.');
    if (!feitas && !recusadas) L.push('Nenhuma linha tinha ' + COL_SENHA + ' preenchida.');

    const txt = L.join('\n');
    console.log(txt);
    return txt;
  }

  function validarUsuario(nome, login, perfil, perfis, senha, ctx, iAtual) {
    if (!nome)  return 'falta o NOME.';
    if (!login) return 'falta o LOGIN — é o que a pessoa digita para entrar.';
    if (!perfil) return 'falta o PERFIL_ID.';
    const dele = perfil.split(';').map(function (x) { return x.trim(); }).filter(String);
    const ruins = dele.filter(function (x) { return perfis.indexOf(x) < 0; });
    if (ruins.length) {
      return 'perfil ' + ruins.map(function (x) { return '"' + x + '"'; }).join(' e ') +
             ' não existe. Use: ' + perfis.join(', ') +
             ' — ou combine vários separando por ponto e vírgula.';
    }
    if (String(senha).length < 8) return 'a senha precisa de ao menos 8 caracteres.';

    // E-mail repetido não é detalhe: o login procura pelo primeiro que achar, e a segunda
    // pessoa nunca entra — sem mensagem que ajude.
    //
    // Quem vence é quem chegou primeiro: linha de cima, ou linha que já tem ID (usuário
    // que já existe). Recusar as duas seria o pior dos mundos — o legítimo também ficaria
    // sem senha, e o problema dobraria em vez de aparecer.
    for (let j = 1; j < ctx.valores.length; j++) {
      if (j === iAtual) continue;
      const outro = Auth.normalizarLogin(ctx.valores[j][ctx.idx.LOGIN]);
      if (!outro || outro !== login) continue;
      const jaExiste = !!celula(ctx.valores[j][ctx.idx.USUARIO_ID]);
      if (j < iAtual || jaExiste) {
        return 'o login "' + login + '" já está na linha ' + (j + 1) +
               (jaExiste ? ' (usuário que já existe).' : '.');
      }
    }
    return null;
  }

  function escrever(ctx, nLinha, coluna, valor) {
    const i = ctx.idx[coluna];
    if (i === undefined) return;
    ctx.sheet.getRange(nLinha, i + 1).setValue(valor);
  }

  /* ====================================================================== */
  /*  CONFERIR                                                              */
  /* ====================================================================== */

  /**
   * O que a planilha deixou passar.
   *
   * Lista suspensa impede o erro de digitação, mas não impede linha apagada, chave
   * repetida nem referência para um registro que não existe mais. É o que se confere
   * aqui — e a distinção importa: BLOQUEIA é o que quebra o app para alguém hoje;
   * aviso é o que vai incomodar depois.
   */
  function conferir() {
    const bloq = [], avisos = [];
    const L = ['Conferência dos cadastros:', ''];

    // --- por aba: chave, duplicata, campo obrigatório ---
    Object.keys(ABAS).forEach(function (t) {
      const def = ABAS[t];
      let ctx;
      try { ctx = Repo.abrir(t); } catch (e) { bloq.push(t + ': ' + e.message); return; }

      const iCh = ctx.idx[def.chave];
      const vistos = {};
      let linhas = 0, semChave = 0, dup = 0, incompletas = 0;

      for (let i = 1; i < ctx.valores.length; i++) {
        const linha = ctx.valores[i];
        if (linha.join('') === '') continue;
        linhas++;

        const k = Import.chave(linha[iCh]);
        if (!k) { semChave++; continue; }
        if (vistos[k]) {
          dup++;
          bloq.push(t + ': ' + def.chave + ' "' + k + '" repetido nas linhas ' + vistos[k] + ' e ' + (i + 1));
        } else vistos[k] = i + 1;

        (def.obrigatorias || []).forEach(function (c) {
          const j = ctx.idx[c];
          if (j !== undefined && celula(linha[j]) === '') {
            incompletas++;
            avisos.push(t + ' linha ' + (i + 1) + ': ' + c + ' em branco');
          }
        });
      }

      // Linha sem chave em aba de cadastro quase sempre é linha nova digitada pela metade.
      if (semChave) {
        avisos.push(t + ': ' + semChave + ' linha(s) sem ' + def.chave +
                    ' — se for cadastro novo, preencha; se for sobra, apague a linha em branco');
      }
      L.push('  ' + pad(t, 16) + linhas + ' linhas · ' + Object.keys(vistos).length + ' ' + def.chave +
             ' distintos' + (dup ? ' · ' + dup + ' REPETIDOS' : '') +
             (incompletas ? ' · ' + incompletas + ' campo(s) obrigatório(s) em branco' : ''));
    });

    // --- referências entre abas ---
    L.push('');
    L.push('Referências:');
    const contas = conjunto('PLANO_CONTAS', 'CODIGO');
    const cats   = conjunto('CATEGORIAS', 'CATEGORIA_ID');
    const forn   = conjunto('FORNECEDORES', 'FORNECEDOR_ID');
    const fil    = conjunto('FILIAIS', 'FILIAL_ID');
    const areas  = conjunto('AREAS', 'AREA_ID');
    const perfis = conjunto('PERFIS', 'PERFIL_ID');

    apontar('CATEGORIAS', ['CONTA_PJ', 'CONTA_PF'], contas, 'conta do plano', bloq, L);
    apontar('CENTRO_CONTA', ['CODIGO_CONTA'], contas, 'conta do plano', bloq, L);
    apontarLista('USUARIOS', 'PERFIL_ID', perfis, 'perfil', bloq, L);
    apontar('ALCADAS', ['PERFIL_APROVADOR'], perfis, 'perfil', bloq, L);

    // Movimento apontando para cadastro que sumiu: é o estrago de apagar linha, e ele só
    // aparece no relatório antigo, quando ninguém mais lembra do que foi apagado.
    apontar('SOLICITACOES', ['FORNECEDOR_ID'], forn,  'fornecedor', bloq, L);
    apontar('SOLICITACOES', ['CATEGORIA_ID'],  cats,  'categoria',  bloq, L);
    apontar('SOLICITACOES', ['FILIAL_EMISSAO'], fil,  'filial',     bloq, L);
    apontar('SOLICITACOES', ['AREA_ID'],       areas, 'área',       bloq, L);

    // --- usuários sem senha ---
    let semLogin = 0;
    Repo.listar('USUARIOS', null, true).forEach(function (u) {
      if (!Auth.normalizarLogin(u.LOGIN)) {
        semLogin++;
        bloq.push('USUARIOS: ' + (u.NOME || u.USUARIO_ID) + ' está sem LOGIN — não consegue entrar. ' +
                  'Rode migrarEstrutura(), que preenche a partir do e-mail.');
      }
    });
    L.push('  usuários sem login: ' + semLogin);

    let semSenha = 0;
    Repo.listar('USUARIOS', null, true).forEach(function (u) {
      const h = String(u.SENHA_HASH || '');
      if (!h || h === 'x') {
        semSenha++;
        bloq.push('USUARIOS: ' + (u.NOME || u.EMAIL || u.USUARIO_ID || 'linha sem identificação') + ' está sem senha — não consegue entrar. ' +
                  'Escreva a senha provisória em ' + COL_SENHA + ' e rode aplicarSenhas().');
      }
    });
    L.push('  usuários sem senha: ' + semSenha);

    // --- senha à mostra ---
    try {
      const ctxU = Repo.abrir('USUARIOS');
      const iS = ctxU.idx[COL_SENHA];
      if (iS !== undefined) {
        let pendentes = 0;
        for (let i = 1; i < ctxU.valores.length; i++) {
          if (celula(ctxU.valores[i][iS])) pendentes++;
        }
        if (pendentes) {
          bloq.push(COL_SENHA + ': ' + pendentes + ' senha(s) em texto na planilha. ' +
                    'Rode aplicarSenhas() — ele grava o hash e apaga a célula.');
        }
      }
    } catch (e) { /* aba já reportada acima */ }

    L.push('');
    L.push('RESUMO');
    L.push('  Bloqueantes: ' + bloq.length);
    bloq.slice(0, 30).forEach(function (b, i) { L.push('    ' + (i + 1) + '. ' + b); });
    if (bloq.length > 30) L.push('    … e mais ' + (bloq.length - 30));
    L.push('  Avisos: ' + avisos.length);
    avisos.slice(0, 20).forEach(function (a, i) { L.push('    ' + (i + 1) + '. ' + a); });
    if (avisos.length > 20) L.push('    … e mais ' + (avisos.length - 20));
    L.push('');
    L.push(bloq.length ? 'Resolva os bloqueantes antes de mandar a equipe usar.'
                       : 'Cadastros consistentes. Rode recarregarCadastros() para o app ver as mudanças.');

    const txt = L.join('\n');
    console.log(txt);
    return txt;
  }

  function pad(s, n) { s = String(s); return s + Array(Math.max(1, n - s.length + 1)).join(' '); }

  function conjunto(tabela, campo) {
    const m = {};
    try {
      Repo.listar(tabela, null, true).forEach(function (r) { m[Import.chave(r[campo])] = true; });
    } catch (e) { /* aba inexistente já foi reportada */ }
    return m;
  }

  /** Campo que guarda VÁRIOS valores separados por ponto e vírgula. */
  function apontarLista(tabela, campo, existe, oQue, bloq, L) {
    let orfas = 0;
    try {
      Repo.listar(tabela, null, true).forEach(function (r) {
        celula(r[campo]).split(';').forEach(function (v) {
          const k = Import.chave(v.trim());
          if (!k) return;
          if (!existe[k]) {
            orfas++;
            if (orfas <= 5) bloq.push(tabela + ': ' + (r.NOME || r.EMAIL || '') +
                                      ' aponta para ' + oQue + ' "' + k + '", que não existe');
          }
        });
      });
    } catch (e) { return; }
    L.push('  ' + pad(tabela + ' → ' + oQue, 34) + (orfas ? orfas + ' ÓRFÃ(S)' : 'ok'));
  }

  function apontar(tabela, campos, existe, oQue, bloq, L) {
    let orfas = 0;
    try {
      Repo.listar(tabela, null, true).forEach(function (r) {
        campos.forEach(function (c) {
          const v = Import.chave(r[c]);
          if (!v) return;
          if (!existe[v]) {
            orfas++;
            if (orfas <= 5) {
              bloq.push(tabela + ': ' + (r[Object.keys(r)[1]] || '') + ' aponta para ' + oQue +
                        ' "' + v + '", que não existe');
            }
          }
        });
      });
    } catch (e) { return; }
    L.push('  ' + pad(tabela + ' → ' + oQue, 34) + (orfas ? orfas + ' ÓRFÃ(S)' : 'ok'));
  }

  /* ====================================================================== */
  /*  CACHE E MENU                                                          */
  /* ====================================================================== */

  /**
   * O app guarda os cadastros em cache por 10 minutos, porque ler a planilha a cada
   * clique é lento. O preço é este: editou a planilha, o app pode demorar até 10 minutos
   * para enxergar. Isto derruba o cache e acaba a espera.
   */
  function recarregar() {
    const chaves = Object.keys(SCHEMA).map(function (t) { return 'T_' + t; });
    try { CacheService.getScriptCache().removeAll(chaves); } catch (e) { /* segue */ }
    Cfg.invalidar();
    const txt = 'Cache derrubado. O app já enxerga o que você editou na planilha.';
    console.log(txt);
    return txt;
  }

  /**
   * Põe um menu "FC Salomé" dentro da própria planilha, com as três ações.
   *
   * É um gatilho instalável, não o onOpen simples: este projeto é independente, não vive
   * dentro da planilha, e o onOpen simples só existe para script que mora nela.
   *
   * Rode uma vez. Depois feche e reabra a planilha — o menu aparece ao lado de "Ajuda".
   */
  function instalarMenu() {
    const id = Cfg.prop('ID_FC_DADOS');
    if (!id) throw new Error('ID_FC_DADOS não está configurado.');

    let existia = 0;
    ScriptApp.getProjectTriggers().forEach(function (g) {
      if (g.getHandlerFunction() === 'aoAbrirPlanilha') { ScriptApp.deleteTrigger(g); existia++; }
    });

    ScriptApp.newTrigger('aoAbrirPlanilha')
      .forSpreadsheet(SpreadsheetApp.openById(id))
      .onOpen()
      .create();

    const txt = (existia ? 'Gatilho antigo removido. ' : '') +
      'Menu instalado. Feche e reabra a planilha FC_DADOS: o menu "FC Salomé" aparece ' +
      'ao lado de "Ajuda".\n' +
      'Se não aparecer, nada se perde — as mesmas funções continuam no editor.';
    console.log(txt);
    return txt;
  }

  /**
   * Onde estão as planilhas.
   *
   * Os IDs moram em ScriptProperties, não em arquivo nenhum — é o que permite ter uma
   * base de teste e uma de produção com o mesmo código. O preço é que o endereço não
   * está escrito em lugar óbvio; daí esta função.
   */
  function links() {
    const L = ['As planilhas do FC Salomé:', ''];
    [['FC_DADOS', 'ID_FC_DADOS', 'cadastros, solicitações, títulos, orçamento'],
     ['FC_LOG',   'ID_FC_LOG',   'log de acesso e de atividades, uma aba por semana']
    ].forEach(function (x) {
      const id = Cfg.prop(x[1]);
      if (!id) { L.push('  ' + x[0] + ' — não configurada (' + x[1] + ' vazio)'); return; }
      let nome = '';
      try { nome = SpreadsheetApp.openById(id).getName(); } catch (e) { nome = '(sem acesso)'; }
      L.push('  ' + x[0] + ' — ' + nome);
      L.push('    ' + x[2]);
      L.push('    https://docs.google.com/spreadsheets/d/' + id + '/edit');
      L.push('');
    });
    const pasta = Cfg.prop('ID_PASTA_RAIZ');
    if (pasta) {
      L.push('  Pasta "FC Salomé" no Drive, com as duas e mais Anexos e Backups:');
      L.push('    https://drive.google.com/drive/folders/' + pasta);
    }
    const txt = L.join('\n');
    console.log(txt);
    return txt;
  }

  return {
    preparar: preparar, aplicarSenhas: aplicarSenhas, conferir: conferir,
    recarregar: recarregar, instalarMenu: instalarMenu, links: links,
    ABAS: ABAS, COL_SENHA: COL_SENHA
  };
})();

/** Chamado pelo gatilho instalado por instalarMenu(). Não rode direto. */
function aoAbrirPlanilha(e) {
  const ss = (e && e.source) || SpreadsheetApp.openById(Cfg.prop('ID_FC_DADOS'));
  ss.addMenu('FC Salomé', [
    { name: 'Conferir cadastros',   functionName: 'conferirCadastros' },
    { name: 'Aplicar senhas novas', functionName: 'aplicarSenhas' },
    { name: 'Recarregar no app',    functionName: 'recarregarCadastros' },
    null,
    { name: 'Preparar planilha (uma vez)', functionName: 'prepararPlanilha' },
    { name: 'Links das planilhas',         functionName: 'linksDasPlanilhas' }
  ]);
}

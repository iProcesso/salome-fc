/**
 * Setup.gs — cria a base do zero.
 *
 * COMO USAR (uma vez só, no editor do Apps Script):
 *   1. Selecione a função criarBases e clique em Executar. Autorize os escopos.
 *   2. Copie do log os IDs das duas planilhas (ficam salvos em ScriptProperties automaticamente).
 *   3. Edite e rode criarPrimeiroUsuario() — a troca de senha é obrigatória no 1º acesso.
 *   4. Publique: Implantar → Nova implantação → App da Web.
 *
 * Rodar de novo é seguro: abas que já existem não são recriadas nem apagadas.
 */
const Setup = (function () {

  function criarBases() {
    const pasta = pastaRaiz();
    const dados = abrirOuCriar('ID_FC_DADOS', 'FC_DADOS — Salomé', pasta);
    const logs  = abrirOuCriar('ID_FC_LOG',   'FC_LOG — Salomé',   pasta);

    TABELAS_DADOS.forEach(function (t) { criarAba(dados, t, SCHEMA[t].cols); });
    TABELAS_LOG.forEach(function (t)   { criarAba(logs,  t, SCHEMA[t].cols); });

    [dados, logs].forEach(function (ss) {
      const p = ss.getSheetByName('Página1') || ss.getSheetByName('Sheet1');
      if (p && ss.getSheets().length > 1) ss.deleteSheet(p);
    });

    semear();

    const msg = 'FC_DADOS: ' + dados.getId() + '\nFC_LOG:   ' + logs.getId();
    console.log('Bases prontas.\n' + msg);
    return msg;
  }

  function pastaRaiz() {
    const nome = 'FC Salomé';
    const it = DriveApp.getFoldersByName(nome);
    const pasta = it.hasNext() ? it.next() : DriveApp.createFolder(nome);
    Cfg.setProp('ID_PASTA_RAIZ', pasta.getId());
    const anexos = pasta.getFoldersByName('Anexos');
    Cfg.setProp('DRIVE_PASTA_ANEXOS',
      (anexos.hasNext() ? anexos.next() : pasta.createFolder('Anexos')).getId());
    const bkp = pasta.getFoldersByName('Backups');
    Cfg.setProp('ID_PASTA_BACKUP',
      (bkp.hasNext() ? bkp.next() : pasta.createFolder('Backups')).getId());
    return pasta;
  }

  function abrirOuCriar(chave, nome, pasta) {
    const id = Cfg.prop(chave);
    if (id) { try { return SpreadsheetApp.openById(id); } catch (e) { /* recria */ } }
    const ss = SpreadsheetApp.create(nome);
    DriveApp.getFileById(ss.getId()).moveTo(pasta);
    Cfg.setProp(chave, ss.getId());
    return ss;
  }

  function criarAba(ss, nome, cols) {
    let sh = ss.getSheetByName(nome);
    if (!sh) sh = ss.insertSheet(nome);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, cols.length).setValues([cols]);
    }
    sh.getRange(1, 1, 1, cols.length)
      .setFontWeight('bold').setBackground('#1F3864').setFontColor('#FFFFFF')
      .setFontSize(9).setVerticalAlignment('middle');
    sh.setFrozenRows(1);
    sh.setRowHeight(1, 28);
    return sh;
  }

  // ------------------------------------------------------------------ seeds

  function semear() {
    if (!Repo.listar('PARAMETROS', null, true).length) {
      lote('PARAMETROS', [
        ['SALDO_INICIAL_CAIXA', '0', 'NUMERO', 'Saldo de caixa no início do horizonte', 'FINANCEIRO'],
        ['SALDO_MINIMO_SEGURANCA', '0', 'NUMERO', 'Abaixo disso o sistema recomenda AVALIAR', 'DIRETORIA'],
        ['HORIZONTE_SEMANAS', '12', 'NUMERO', 'Semanas projetadas no fluxo de caixa', 'FINANCEIRO'],
        ['PERMITE_COMPRA_OUTRA_UNIDADE', 'NAO', 'TEXTO', 'SIM: o solicitante pode pedir compra para outra unidade', 'FINANCEIRO'],
        ['DIAS_PAGAMENTO', '2,4,6', 'TEXTO', 'Dias da semana em que se paga (1=domingo)', 'FINANCEIRO'],
        ['SESSAO_HORAS', '8', 'NUMERO', 'Duração da sessão do usuário', 'ADMIN'],
        ['LOGIN_TENTATIVAS_MAX', '5', 'NUMERO', 'Bloqueio temporário após N falhas', 'ADMIN'],
        ['SENHA_VALIDADE_DIAS', '90', 'NUMERO', 'Expiração obrigatória da senha', 'ADMIN'],
        ['LOG_SEMANAS_ONLINE', '12', 'NUMERO', 'Abas de log mantidas antes de arquivar', 'ADMIN'],
        ['EMAIL_REMETENTE', '', 'TEXTO', 'Remetente das notificações', 'ADMIN'],
        ['UI_SOURCE', 'LOCAL', 'TEXTO', 'LOCAL (clasp) ou GITHUB (busca o HTML em runtime)', 'ADMIN'],
        ['GITHUB_RAW', '', 'TEXTO', 'URL raw do index.html oficial quando UI_SOURCE = GITHUB', 'ADMIN'],
        ['VERSAO_APP', VERSAO, 'TEXTO', 'Mostrada no rodapé do app', 'ADMIN'],
        ['RET_IRRF_PJ', '1.5', 'NUMERO', 'IRRF sobre serviço de PJ não optante do Simples (%)', 'FINANCEIRO'],
        ['RET_CSRF_PJ', '4.65', 'NUMERO', 'PIS/COFINS/CSLL sobre serviço de PJ, acima do piso (%)', 'FINANCEIRO'],
        ['RET_ISS', '0', 'NUMERO', 'ISS retido — depende do município do serviço (%)', 'FINANCEIRO'],
        ['RET_INSS_PF', '11', 'NUMERO', 'INSS retido de prestador pessoa física (%)', 'FINANCEIRO'],
        ['RET_INSS_FRETE_PF', '11', 'NUMERO', 'INSS do frete de autônomo, sobre 20% do frete (%)', 'FINANCEIRO'],
        ['RET_SEST_SENAT', '2.5', 'NUMERO', 'SEST/SENAT do frete de autônomo, sobre 20% do frete (%)', 'FINANCEIRO']
      ]);
    }

    if (!Repo.listar('PERFIS', null, true).length) {
      lote('PERFIS', [
        ['SOLICITANTE', 'Solicitante', 'Lança e acompanha as próprias solicitações', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', ''],
        ['FINANCEIRO', 'Financeiro', 'Opera títulos e rateio; aprova até o limite da alçada', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', ''],
        ['DIRETORIA', 'Diretoria', 'Aprova qualquer valor e edita orçamento', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', ''],
        ['ADMIN', 'Administrador', 'Cadastros, usuários, permissões e logs — não aprova', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', '']
      ]);
    }

    if (!Repo.listar('PERMISSOES', null, true).length) lote('PERMISSOES', permissoesPadrao());
    if (!Repo.listar('PERMISSOES_CAMPO', null, true).length) lote('PERMISSOES_CAMPO', camposPadrao());

    if (!Repo.listar('FORMAS_PGTO', null, true).length) {
      lote('FORMAS_PGTO', [
        ['PIX', 'PIX', 'SIM', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', ''],
        ['BOLETO', 'Boleto bancário', 'NAO', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', ''],
        ['CARTAO', 'Cartão de crédito', 'NAO', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', ''],
        ['TED', 'Transferência (TED)', 'SIM', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', ''],
        ['DEBAUT', 'Débito automático', 'SIM', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', '']
      ]);
    }

    if (!Repo.listar('CONDICOES_PGTO', null, true).length) {
      lote('CONDICOES_PGTO', [
        ['ANTEC', 'Antecipado', 'ANTECIPADO', '-2', 1, 'Antes da entrega — exige diretoria', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', ''],
        ['AVISTA', 'À vista', 'DIAS_CORRIDOS', '0', 1, 'No ato', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', ''],
        ['FSQ', 'Fora semana / próxima quarta', 'FORA_SEMANA_DIA', '4', 1, 'Fecha a semana e paga na quarta seguinte', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', ''],
        ['D15', '15 dias', 'DIAS_CORRIDOS', '15', 1, 'Da emissão da NF', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', ''],
        ['D28', '28 dias', 'DIAS_CORRIDOS', '28', 1, 'Da emissão da NF', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', ''],
        ['D3060', '30/60 dias', 'DIAS_CORRIDOS', '30', 2, 'Gera 2 títulos', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', '']
      ]);
    }

    if (!Repo.listar('ALCADAS', null, true).length) {
      lote('ALCADAS', [
        ['ALC-1', 1, 'Alçada 1 · Financeiro', 5000, 'FINANCEIRO', 1, 'NAO', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', ''],
        ['ALC-2', 2, 'Alçada 2 · Diretoria', 50000, 'DIRETORIA', 2, 'NAO', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', ''],
        ['ALC-3', 3, 'Alçada 3 · Diretoria, dupla assinatura', 99999999, 'DIRETORIA', 3, 'SIM', 'ATIVO', new Date(), 'setup', '', '', 1, '', '', '']
      ]);
    }
  }

  /**
   * Escreve direto, sem passar pelo Repo (que ainda depende dos seeds).
   * As linhas dos seeds vêm na ordem do SCHEMA, então são traduzidas para a ordem REAL
   * do cabeçalho antes de gravar — numa aba migrada as duas ordens não coincidem.
   */
  function lote(tabela, linhas) {
    const ctx = Repo.abrir(tabela);
    const cols = SCHEMA[tabela].cols;
    const valores = linhas.map(function (l) {
      const o = {};
      cols.forEach(function (c, i) { o[c] = (i < l.length) ? l[i] : ''; });
      return ctx.cab.map(function (n) {
        const k = String(n).trim();
        return (k in o) ? o[k] : '';
      });
    });
    ctx.sheet.getRange(ctx.sheet.getLastRow() + 1, 1, valores.length, ctx.cab.length)
             .setValues(valores);
    Repo.invalidar(tabela);
  }

  function permissoesPadrao() {
    const R = ['SOLICITACAO', 'APROVACAO', 'TITULO_PAGAR', 'TITULO_RECEBER', 'RATEIO', 'ORCAMENTO',
               'PLANO_CONTAS', 'CATEGORIA', 'CENTRO_CUSTO',
               'FORNECEDOR', 'FILIAL', 'AREA', 'USUARIO', 'PERFIL', 'PARAMETRO',
               'LOG', 'IMPORTACAO'];
    // [ver, incluir, alterar, inativar, aprovar, exportar, importar]
    const P = {
      SOLICITANTE: { SOLICITACAO: 'SSSNNSN', APROVACAO: 'SNNNNNN', PLANO_CONTAS: 'SNNNNNN',
                     FORNECEDOR: 'SNNNNNN', FILIAL: 'SNNNNNN', AREA: 'SNNNNNN' },
      FINANCEIRO:  { SOLICITACAO: 'SSSNSSS', APROVACAO: 'SSSNSSN', TITULO_PAGAR: 'SSSNNSS',
                     TITULO_RECEBER: 'SSSNNSS', RATEIO: 'SSSNNSN', ORCAMENTO: 'SNNNNSN',
                     PLANO_CONTAS: 'SNNNNSN', FORNECEDOR: 'SSSSNSS', FILIAL: 'SNNNNSN',
                     AREA: 'SNNNNSN', LOG: 'SNNNNSN', IMPORTACAO: 'SSNNNSS' },
      DIRETORIA:   { SOLICITACAO: 'SSSNSSN', APROVACAO: 'SSSNSSN', TITULO_PAGAR: 'SNNNNSN',
                     TITULO_RECEBER: 'SNNNNSN', RATEIO: 'SNNNNSN', ORCAMENTO: 'SSSNNSS',
                     PLANO_CONTAS: 'SNNNNSN', FORNECEDOR: 'SNNNNSN', FILIAL: 'SNNNNSN',
                     AREA: 'SNNNNSN', LOG: 'SNNNNSN' },
      ADMIN:       { SOLICITACAO: 'SSSNNSN', APROVACAO: 'SNNNNSN', TITULO_PAGAR: 'SNNNNSN',
                     TITULO_RECEBER: 'SNNNNSN', RATEIO: 'SNNNNSN', ORCAMENTO: 'SNNNNSN',
                     PLANO_CONTAS: 'SSSSNSS', FORNECEDOR: 'SSSSNSS', FILIAL: 'SSSSNSS',
                     AREA: 'SSSSNSS', USUARIO: 'SSSSNSS', PERFIL: 'SSSSNSS', PARAMETRO: 'SNSNNSN',
                     LOG: 'SNNNNSN', IMPORTACAO: 'SSNNNSS' }
    };
    const ESCOPO = { SOLICITANTE: 'PROPRIO', FINANCEIRO: 'TODAS', DIRETORIA: 'TODAS', ADMIN: 'TODAS' };
    // O divisor da alçada. Até este valor o Financeiro decide sozinho; acima, é Diretoria.
    // Mora aqui e na aba ALCADAS, e os dois têm de contar a mesma história — por isso
    // Migrar.ajustarAlcadas() mexe nos dois de uma vez.
    const TETO_FINANCEIRO = 5000;
    const LIMITE = { SOLICITANTE: 0, FINANCEIRO: TETO_FINANCEIRO, DIRETORIA: 99999999, ADMIN: 0 };

    const linhas = [];
    Object.keys(P).forEach(function (perfil) {
      R.forEach(function (rec) {
        const s = P[perfil][rec] || 'NNNNNNN';
        linhas.push([perfil, rec, s[0], s[1], s[2], s[3], s[4], s[5], s[6],
                     ESCOPO[perfil], rec === 'SOLICITACAO' ? LIMITE[perfil] : 0]
                    .map(function (v) { return v === 'S' ? 'SIM' : (v === 'N' ? 'NAO' : v); }));
      });
    });
    return linhas;
  }

  function camposPadrao() {
    return [
      ['SOLICITANTE', 'SOLICITACAO', '*', 'RASCUNHO', 'SIM', 'NAO'],
      ['SOLICITANTE', 'SOLICITACAO', '*', 'AGUARDANDO_APROVACAO', 'NAO', 'NAO'],
      ['SOLICITANTE', 'SOLICITACAO', 'OBSERVACAO', 'AGUARDANDO_APROVACAO', 'SIM', 'NAO'],
      ['SOLICITANTE', 'SOLICITACAO', '*', 'REPROGRAMADO', 'NAO', 'NAO'],
      ['FINANCEIRO', 'SOLICITACAO', '*', '*', 'SIM', 'NAO'],
      ['FINANCEIRO', 'SOLICITACAO', 'VALOR_BRUTO', 'APROVADO', 'NAO', 'NAO'],
      ['FINANCEIRO', 'SOLICITACAO', 'VALOR_BRUTO', 'COMPROMETIDO', 'NAO', 'NAO'],
      ['FINANCEIRO', 'SOLICITACAO', 'VALOR_COMPROMETIDO', 'COMPROMETIDO', 'SIM', 'SIM'],
      ['FINANCEIRO', 'SOLICITACAO', '*', 'PAGO', 'NAO', 'NAO'],
      ['DIRETORIA', 'SOLICITACAO', '*', '*', 'SIM', 'NAO'],
      ['DIRETORIA', 'SOLICITACAO', '*', 'PAGO', 'NAO', 'NAO'],
      ['ADMIN', 'SOLICITACAO', '*', 'RASCUNHO', 'SIM', 'NAO'],
      ['ADMIN', 'SOLICITACAO', '*', '*', 'NAO', 'NAO']
    ];
  }

  // ------------------------------------------------------------------ admin

  /** Rode uma vez para criar o primeiro usuário. */
  function criarAdmin(nome, login, senhaProvisoria) {
    return criarUsuario(nome, login, 'ADMIN', 'TODAS', senhaProvisoria);
  }

  /**
   * Cria um usuário com perfil e escopo. A senha é sempre provisória: a troca é
   * obrigatória no primeiro acesso, e o hash nasce do Auth — nunca é escrito aqui.
   *
   * O perfil decide o que a pessoa faz, e os quatro não se sobrepõem por acidente:
   *   SOLICITANTE  abre pedido e acompanha o dele. Não aprova.
   *   FINANCEIRO   valida, consulta caixa, aprova até o teto da alçada, recebe.
   *   DIRETORIA    a mesma coisa, sem teto de alçada.
   *   ADMIN        cadastros, usuários, permissões e log. **Não aprova e não move card.**
   *
   * Esse último ponto é de propósito, não é falta: quem configura o sistema não é quem
   * autoriza o dinheiro. Para operar o fluxo, a mesma pessoa usa uma segunda conta.
   *
   * escopoFilial: 'TODAS', ou as filiais separadas por ponto e vírgula — 'RP;CPQ'.
   *
   * O segundo parâmetro é o LOGIN — o que a pessoa digita para entrar. Não é e-mail:
   * metade da equipe não tem caixa própria, e inventar endereço só para servir de
   * identificador cria um dado que ninguém mantém. E-mail fica opcional, na ficha.
   */
  function criarUsuario(nome, login, perfil, escopoFilial, senhaProvisoria, email) {
    if (!nome || !login || !perfil || !senhaProvisoria) {
      throw new Error("Use: criarUsuario('Nome', 'login', 'PERFIL', 'TODAS', 'senhaProvisoria')");
    }
    if (String(senhaProvisoria).length < 8) {
      throw new Error('A senha provisória precisa de pelo menos 8 caracteres.');
    }
    // Vários perfis na mesma pessoa, separados por ponto e vírgula. A permissão vira a
    // união deles — quem lança a compra da frota muitas vezes é quem confere o caixa.
    const dele = String(perfil).toUpperCase().split(';')
      .map(function (x) { return x.trim(); }).filter(String);
    const ruins = dele.filter(function (x) { return !Repo.achar('PERFIS', 'PERFIL_ID', x); });
    if (ruins.length) {
      throw new Error('Perfil inexistente: ' + ruins.join(', ') +
                      '. Use SOLICITANTE, FINANCEIRO, DIRETORIA ou ADMIN — ou vários, ' +
                      'separados por ponto e vírgula.');
    }

    const chave = Auth.normalizarLogin(login);
    if (!chave) throw new Error('O login "' + login + '" fica vazio depois de normalizado. Use letras e números.');
    const repetido = Repo.listar('USUARIOS', null, true).filter(function (x) {
      return Auth.normalizarLogin(x.LOGIN) === chave;
    })[0];
    if (repetido) throw new Error('Já existe usuário com o login "' + chave + '": ' + repetido.NOME + '.');
    const mail = String(email || '').toLowerCase().trim();

    const r = Repo.salvar('USUARIOS', {
      NOME: nome, LOGIN: chave, EMAIL: mail, PERFIL_ID: dele.join(';'),
      ESCOPO_FILIAL: escopoFilial || 'TODAS', LIMITE_ALCADA: 0,
      SENHA_HASH: 'x', SENHA_SALT: 'x', SENHA_TROCAR: 'SIM',
      SENHA_EXPIRA_EM: new Date(), TENTATIVAS_FALHA: 0, STATUS: 'ATIVO'
    }, null, { forcar: true });

    Auth.definirSenha(r.registro.USUARIO_ID, senhaProvisoria, true);
    console.log('Usuário criado: ' + r.registro.USUARIO_ID + ' · ' + nome +
                ' · ' + dele.join(';') + ' · login: ' + chave);
    return r.registro.USUARIO_ID;
  }

  /**
   * Senha nova para quem esqueceu a antiga — provisória, troca obrigatória no acesso.
   * A senha atual não é lida (nem daria: é hash com salt). É substituída.
   */
  function redefinirSenha(login, senhaProvisoria) {
    const chave = Auth.normalizarLogin(login);
    const u = Repo.listar('USUARIOS', null, true).filter(function (x) {
      return Auth.normalizarLogin(x.LOGIN) === chave;
    })[0];
    if (!u) throw new Error('Não achei usuário com o login ' + login + '.');
    if (String(senhaProvisoria).length < 8) {
      throw new Error('A senha provisória precisa de pelo menos 8 caracteres.');
    }
    Auth.definirSenha(u.USUARIO_ID, senhaProvisoria, true);
    console.log('Senha redefinida para ' + u.NOME + ' (login ' + u.LOGIN + '). Troca obrigatória no próximo acesso.');
    return u.USUARIO_ID;
  }

  /** Quem existe hoje, com perfil e situação. */
  function listarUsuarios() {
    const l = Repo.listar('USUARIOS', null, true).map(function (u) {
      return '  ' + u.USUARIO_ID + ' · ' + u.NOME + ' · ' + u.PERFIL_ID +
             ' · login: ' + (u.LOGIN || '(sem login!)') + ' · ' + u.STATUS +
             (u.SENHA_TROCAR === 'SIM' ? ' · senha provisória' : '');
    });
    const txt = (l.length ? 'Usuários cadastrados:\n' + l.join('\n') : 'Nenhum usuário cadastrado ainda.');
    console.log(txt);
    return txt;
  }

  /** Diagnóstico rápido: confere se tudo que o app precisa está no lugar. */
  function verificar() {
    const p = [];
    ['ID_FC_DADOS', 'ID_FC_LOG', 'PEPPER', 'DRIVE_PASTA_ANEXOS'].forEach(function (k) {
      p.push(k + ': ' + (Cfg.prop(k) ? 'ok' : 'FALTANDO'));
    });
    TABELAS_DADOS.forEach(function (t) {
      const sh = Repo.ss('FC_DADOS').getSheetByName(t);
      p.push('aba ' + t + ': ' + (sh ? (sh.getLastRow() - 1) + ' linhas' : 'FALTANDO'));
    });
    p.push('usuários ativos: ' + Repo.listar('USUARIOS').length);
    console.log(p.join('\n'));
    return p.join('\n');
  }

  return { criarBases: criarBases, criarAdmin: criarAdmin, criarUsuario: criarUsuario,
           redefinirSenha: redefinirSenha, listarUsuarios: listarUsuarios, verificar: verificar,
           semear: semear, permissoesPadrao: permissoesPadrao, camposPadrao: camposPadrao };
})();

/* ==========================================================================
   ATALHOS PARA RODAR NO MENU "Executar" DO EDITOR
   Atenção: no Apps Script, função com "_" no fim é PRIVADA e NÃO aparece na
   lista de execução. Por isso nenhuma delas termina em underscore.
   ========================================================================== */

/** PASSO 1 — cria as planilhas, as abas e os cadastros-semente. */
function criarBases() { return Setup.criarBases(); }

/**
 * PASSO 2 — cria as DUAS contas iniciais.
 *
 * São duas de propósito, e não é burocracia: o perfil ADMIN cuida de cadastro,
 * usuário, permissão e log, e **não aprova nem move card**. Quem configura o
 * sistema não é quem autoriza o dinheiro — é a mesma separação que qualquer
 * auditoria procura. Para operar o fluxo de ponta a ponta, a conta é a de
 * Diretoria, que aprova sem teto de alçada.
 *
 * Edite os valores e execute. As duas senhas são provisórias: a troca é
 * obrigatória no primeiro acesso de cada uma.
 */
function criarPrimeiroUsuario() {
  const NOME  = 'Kleber Zumiotti';
  const SENHA = 'trocar@2026';                       // mínimo 8 caracteres

  const admin = Setup.criarUsuario(NOME, 'kleber.admin', 'ADMIN', 'TODAS', SENHA,
                                   'kleber.zumiotti@iprocesso.com');
  const dir   = Setup.criarUsuario(NOME, 'kleber', 'DIRETORIA', 'TODAS', SENHA,
                                   'kleber.zumiotti@iprocesso.com');

  const txt = 'Duas contas criadas:\n' +
    '  ADMIN     login "kleber.admin" (' + admin + ') — cadastros, usuários, log\n' +
    '  DIRETORIA login "kleber"       (' + dir + ') — solicita, aprova, move card\n' +
    'Senha provisória nas duas: ' + SENHA + ' — troca obrigatória no primeiro acesso.';
  console.log(txt);
  return txt;
}

/**
 * Cria o resto da equipe. Edite a lista e execute quantas vezes quiser:
 * e-mail que já existe é pulado com aviso, nada é sobrescrito.
 *
 * Perfis: SOLICITANTE · FINANCEIRO · DIRETORIA · ADMIN
 * Escopo: 'TODAS' ou as filiais separadas por ponto e vírgula — 'RP;CPQ'
 */
function criarEquipe() {
  const EQUIPE = [
    // ['Nome completo', 'login', 'PERFIL', 'ESCOPO', 'senhaProvisoria', 'email (opcional)'],
    // ['Fulano de Tal',  'fulano',  'SOLICITANTE', 'RP',    'trocar@2026'],
    // ['Ciclana Souza',  'ciclana', 'FINANCEIRO',  'TODAS', 'trocar@2026', 'ciclana@salome.com.br'],
  ];
  if (!EQUIPE.length) {
    const aviso = 'A lista EQUIPE está vazia. Edite a função criarEquipe() e rode de novo.';
    console.log(aviso);
    return aviso;
  }
  const l = [];
  EQUIPE.forEach(function (u) {
    try { l.push('  ok ..... ' + u[1] + ' · ' + Setup.criarUsuario(u[0], u[1], u[2], u[3], u[4], u[5])); }
    catch (e) { l.push('  pulado . ' + u[1] + ' · ' + e.message); }
  });
  const txt = l.join('\n');
  console.log(txt);
  return txt;
}

/** Quem já está cadastrado, com perfil e situação da senha. */
function listarUsuarios() { return Setup.listarUsuarios(); }

/**
 * Senha nova para quem esqueceu a antiga. Edite os dois valores e execute.
 * A senha atual não é lida — é hash com salt, ninguém lê. É substituída.
 */
function redefinirSenha() {
  const LOGIN = 'kleber';
  const SENHA = 'trocar@2026';        // mínimo 8 caracteres
  return Setup.redefinirSenha(LOGIN, SENHA);
}

/** PASSO 3 — diagnóstico: mostra no log o que está e o que falta. */
function verificar() { return Setup.verificar(); }

/**
 * Mostra qual URL está guardada — e por que rodar isto no editor não resolve.
 *
 * `ScriptApp.getService().getUrl()` responde conforme quem pergunta. Pelo editor devolve
 * a URL de teste, terminada em "/dev", que só abre para quem edita o projeto. Mandar
 * aquilo num e-mail é mandar um link que ninguém consegue abrir. E trocar "/dev" por
 * "/exec" no texto não adianta: o identificador da implantação de teste é outro.
 *
 * Quem anota a URL certa é o próprio app, no primeiro acesso de alguém à versão
 * publicada. Então: publique, abra a /exec uma vez, e rode isto para conferir.
 */
function registrarUrlDoApp() {
  const guardada = Cfg.prop('URL_APP');
  const aqui = (function () { try { return ScriptApp.getService().getUrl(); } catch (e) { return ''; } })();

  const l = [];
  l.push('URL guardada em URL_APP: ' + (guardada || '(nenhuma ainda)'));
  l.push('URL que o editor enxerga:  ' + (aqui || '(indisponível)') +
         (aqui && aqui.indexOf('/dev') >= 0 ? '   ← de teste, não serve para e-mail' : ''));
  l.push('');
  l.push(guardada && guardada.indexOf('/exec') >= 0
    ? 'Tudo certo: é a URL pública.'
    : 'Ainda falta. Publique, abra a URL /exec uma vez no navegador e rode isto de novo. ' +
      'Se preferir, cole a /exec na função definirUrlDoApp() e execute.');
  const txt = l.join('\n');
  console.log(txt);
  return txt;
}

/**
 * Caminho manual: cole aqui a URL /exec que aparece em Implantar → Gerenciar implantações
 * e execute. Só aceita /exec — /dev é rejeitada de propósito.
 */
function definirUrlDoApp() {
  const URL = '';        // cole entre as aspas, terminando em /exec

  if (!URL) throw new Error('Cole a URL /exec dentro das aspas, na primeira linha da função.');
  if (URL.indexOf('/exec') < 0) {
    throw new Error('Essa URL não termina em /exec. A que termina em /dev só abre para quem edita o projeto.');
  }
  // Tira o "/a/dominio.com": quem não tem conta do domínio do dono do script tropeça
  // numa tela de escolha de conta antes de chegar ao login do app.
  const publica = urlPublica(URL);
  Cfg.setProp('URL_APP', publica);
  console.log('URL_APP = ' + publica);
  return publica;
}

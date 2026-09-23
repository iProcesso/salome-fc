/**
 * Diagnostico.gs — raio-X do sistema.
 *
 * Rode a função  diagnosticar()  no editor e leia o log (Ctrl+Enter).
 * Ele confere infraestrutura, abas, cabeçalhos, cadastros, parâmetros,
 * usuários, gatilhos e implantação — e separa o que é BLOQUEANTE do que é aviso.
 *
 * Não altera nada. É só leitura.
 */

/**
 * O dono do sistema, sem perguntar ao Google. Usar Session.getEffectiveUser() exigiria
 * o escopo userinfo.email, que este app não precisa: a autenticação é própria e a
 * lista de usuários está na planilha.
 */
function emailDoDono() {
  const r = Cfg.param('EMAIL_REMETENTE', '');
  if (r) return r;
  const admin = Repo.listar('USUARIOS').filter(function (u) { return u.PERFIL_ID === 'ADMIN'; })[0];
  return admin ? admin.EMAIL : '';
}

function diagnosticar() {
  const L = [];
  const bloq = [];
  const avisos = [];

  const pad = function (s, n) { s = String(s); return s + Array(Math.max(1, n - s.length + 1)).join('.'); };
  const linha = function (nivel, rotulo, detalhe) {
    const tag = nivel === 'ok' ? '  [ ok ] ' : (nivel === 'aviso' ? '  [aviso] ' : '  [BLOQ] ');
    L.push(tag + pad(rotulo, 34) + ' ' + detalhe);
    if (nivel === 'bloq') bloq.push(rotulo + ' — ' + detalhe);
    if (nivel === 'aviso') avisos.push(rotulo + ' — ' + detalhe);
  };
  const cabec = function (t) { L.push(''); L.push(t); L.push(Array(t.length + 1).join('=')); };

  L.push('FC SALOMÉ — DIAGNÓSTICO');
  L.push(Utilities.formatDate(new Date(), 'America/Sao_Paulo', "dd/MM/yyyy HH:mm") + '  ·  conta: '
         + (emailDoDono() || '(nenhum usuário ADMIN cadastrado)'));

  // ------------------------------------------------------------------ 1
  cabec('1. INFRAESTRUTURA');
  const props = {
    ID_FC_DADOS: 'planilha de dados',
    ID_FC_LOG: 'planilha de log',
    PEPPER: 'segredo das senhas',
    DRIVE_PASTA_ANEXOS: 'pasta de anexos',
    ID_PASTA_BACKUP: 'pasta de backup',
    URL_APP: 'URL publicada (usada nos e-mails)'
  };
  Object.keys(props).forEach(function (k) {
    const v = Cfg.prop(k);
    if (v) {
      linha('ok', k, (k === 'PEPPER' ? 'definido' : String(v).substring(0, 12) + '…'));
    } else {
      const critico = (k === 'ID_FC_DADOS' || k === 'ID_FC_LOG' || k === 'PEPPER');
      linha(critico ? 'bloq' : 'aviso', k,
            'AUSENTE (' + props[k] + ')' + (k === 'URL_APP' ? ' — rode registrarUrlDoApp()' : ''));
    }
  });

  let ssDados = null, ssLog = null;
  try { ssDados = Repo.ss('FC_DADOS'); linha('ok', 'Abrir FC_DADOS', ssDados.getName()); }
  catch (e) { linha('bloq', 'Abrir FC_DADOS', String(e).substring(0, 80)); }
  try { ssLog = Repo.ss('FC_LOG'); linha('ok', 'Abrir FC_LOG', ssLog.getName()); }
  catch (e) { linha('bloq', 'Abrir FC_LOG', String(e).substring(0, 80)); }

  // ------------------------------------------------------------------ 2
  cabec('2. ABAS E CABEÇALHOS (FC_DADOS)');
  const OBRIGATORIO_TER_DADOS = ['PARAMETROS', 'PERFIS', 'PERMISSOES', 'PERMISSOES_CAMPO',
                                 'FORMAS_PGTO', 'CONDICOES_PGTO', 'ALCADAS', 'USUARIOS'];
  const CADASTRO_DA_SALOME = ['PLANO_CONTAS', 'FILIAIS', 'AREAS', 'FORNECEDORES'];

  if (ssDados) {
    TABELAS_DADOS.forEach(function (t) {
      const sh = ssDados.getSheetByName(t);
      if (!sh) { linha('bloq', t, 'ABA NÃO EXISTE — rode criarBases()'); return; }

      const esperado = SCHEMA[t].cols;
      const atual = sh.getRange(1, 1, 1, Math.max(1, sh.getLastColumn())).getValues()[0]
                      .map(function (x) { return String(x).trim(); })
                      .filter(function (x) { return x !== ''; });
      const faltando = esperado.filter(function (c) { return atual.indexOf(c) < 0; });
      const sobrando = atual.filter(function (c) { return esperado.indexOf(c) < 0; });
      const linhas = Math.max(0, sh.getLastRow() - 1);

      if (faltando.length) {
        linha('bloq', t, linhas + ' linhas · FALTAM COLUNAS: ' + faltando.join(', '));
      } else if (sobrando.length) {
        linha('aviso', t, linhas + ' linhas · colunas a mais: ' + sobrando.join(', '));
      } else if (linhas === 0 && OBRIGATORIO_TER_DADOS.indexOf(t) >= 0) {
        linha('bloq', t, 'VAZIA — o sistema não funciona sem ela');
      } else if (linhas === 0 && CADASTRO_DA_SALOME.indexOf(t) >= 0) {
        linha('bloq', t, 'VAZIA — cadastro da Salomé ainda não carregado');
      } else if (linhas === 0) {
        linha('ok', t, 'vazia (normal, se enche com o uso)');
      } else {
        linha('ok', t, linhas + ' linhas · cabeçalho confere');
      }
    });
  }

  // ------------------------------------------------------------------ 3
  cabec('3. ABAS DE LOG (FC_LOG)');
  if (ssLog) {
    TABELAS_LOG.forEach(function (t) {
      linha(ssLog.getSheetByName(t) ? 'ok' : 'bloq', t,
            ssLog.getSheetByName(t) ? 'modelo presente' : 'MODELO AUSENTE — rode criarBases()');
    });
    const semana = Log.semanaISO(new Date());
    ['LOG_ACESSO_', 'LOG_ATIV_'].forEach(function (pre) {
      const nome = pre + semana;
      const sh = ssLog.getSheetByName(nome);
      linha(sh ? 'ok' : 'aviso', nome,
            sh ? (sh.getLastRow() - 1) + ' registros nesta semana'
               : 'ainda não criada (nasce no 1º uso real)');
    });
  }

  // ------------------------------------------------------------------ 4
  cabec('4. PARÂMETROS QUE MUDAM O COMPORTAMENTO');
  const p = Cfg.params();
  const checarNum = function (chave, texto) {
    const v = Number(p[chave] || 0);
    if (!v) linha('bloq', chave, '= 0 — ' + texto);
    else linha('ok', chave, 'R$ ' + v.toLocaleString('pt-BR'));
  };
  checarNum('SALDO_INICIAL_CAIXA', 'sem saldo inicial o fluxo de caixa inteiro é ficção');
  checarNum('SALDO_MINIMO_SEGURANCA', 'com zero, TODA solicitação sai como LIBERAR');
  linha('ok', 'HORIZONTE_SEMANAS', String(p.HORIZONTE_SEMANAS || 12));
  linha(p.UI_SOURCE === 'GITHUB' && !p.GITHUB_RAW ? 'bloq' : 'ok', 'UI_SOURCE',
        (p.UI_SOURCE || 'LOCAL') + (p.UI_SOURCE === 'GITHUB' ? ' · ' + (p.GITHUB_RAW || 'SEM GITHUB_RAW') : ''));
  linha(p.EMAIL_REMETENTE ? 'ok' : 'aviso', 'EMAIL_REMETENTE',
        p.EMAIL_REMETENTE || 'vazio — as notificações saem do dono do script');
  linha('ok', 'VERSAO_APP', String(p.VERSAO_APP || '(não definida)'));

  // ------------------------------------------------------------------ 5
  cabec('5. ACESSO DAS PESSOAS');
  let usuarios = [];
  try { usuarios = Repo.listar('USUARIOS', null, true); } catch (e) {}
  const ativos = usuarios.filter(function (u) { return u.STATUS === 'ATIVO'; });
  const admins = ativos.filter(function (u) { return u.PERFIL_ID === 'ADMIN'; });
  const semSenha = ativos.filter(function (u) { return !u.SENHA_HASH || String(u.SENHA_HASH).length < 20; });
  const devemTrocar = ativos.filter(function (u) { return String(u.SENHA_TROCAR).toUpperCase() === 'SIM'; });

  linha(ativos.length ? 'ok' : 'bloq', 'Usuários ativos', ativos.length + ' de ' + usuarios.length + ' cadastrados');
  linha(admins.length ? 'ok' : 'bloq', 'Administradores', admins.length ? admins.map(function (u) { return u.EMAIL; }).join(', ') : 'NENHUM — rode criarPrimeiroUsuario()');
  if (semSenha.length) linha('bloq', 'Sem senha definida', semSenha.map(function (u) { return u.EMAIL; }).join(', '));
  if (devemTrocar.length) linha('aviso', 'Troca de senha pendente', devemTrocar.length + ' usuário(s)');

  const porPerfil = {};
  ativos.forEach(function (u) { porPerfil[u.PERFIL_ID] = (porPerfil[u.PERFIL_ID] || 0) + 1; });
  ['SOLICITANTE', 'FINANCEIRO', 'DIRETORIA'].forEach(function (pf) {
    linha(porPerfil[pf] ? 'ok' : 'aviso', 'Perfil ' + pf,
          (porPerfil[pf] || 0) + ' usuário(s)' + (porPerfil[pf] ? '' : ' — ninguém consegue fazer esse papel'));
  });

  let sessoes = 0;
  try {
    sessoes = Repo.listar('SESSOES', function (s) {
      return !s.ENCERRADA_EM && new Date(s.EXPIRA_EM) > new Date();
    }, true).length;
  } catch (e) {}
  linha('ok', 'Sessões abertas agora', String(sessoes));

  // ------------------------------------------------------------------ 6
  cabec('6. IMPLANTAÇÃO E GATILHOS');
  let url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (e) {}
  linha(url ? 'ok' : 'bloq', 'Web App publicado', url || 'NÃO PUBLICADO — Implantar → Nova implantação');
  if (url && Cfg.prop('URL_APP') && Cfg.prop('URL_APP') !== url) {
    linha('aviso', 'URL_APP desatualizada', 'os e-mails apontam para uma URL antiga — rode registrarUrlDoApp()');
  }

  const gat = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  ['jobBackupDiario', 'jobArquivarLogs', 'jobLimparSessoes'].forEach(function (f) {
    linha(gat.indexOf(f) >= 0 ? 'ok' : 'aviso', f,
          gat.indexOf(f) >= 0 ? 'instalado' : 'ausente — rode instalarGatilhos()');
  });

  // ------------------------------------------------------------------ 7
  cabec('7. LIGAÇÃO ENTRE A TELA E O SERVIDOR');
  let temIndex = false, temApi = false, temMock = false, temLogin = false;
  try {
    const html = HtmlService.createHtmlOutputFromFile('index').getContent();
    temIndex = true;
    temApi   = html.indexOf('google.script.run') >= 0;
    temMock  = html.indexOf('DADOS FICTÍCIOS') >= 0 || html.indexOf('const SOL = [') >= 0
               || html.indexOf('const SOL=[') >= 0;
    temLogin = html.indexOf("api('auth.login'") >= 0 || html.indexOf('api("auth.login"') >= 0;
  } catch (e) {}
  linha(temIndex ? 'ok' : 'bloq', 'Arquivo index', temIndex ? 'encontrado' : 'NÃO EXISTE arquivo HTML chamado index');
  linha(temApi ? 'ok' : 'bloq', 'Ponte google.script.run', temApi ? 'presente' : 'AUSENTE — a tela não fala com o servidor');
  linha(temLogin ? 'ok' : 'bloq', 'Login ligado ao servidor', temLogin ? 'sim' : 'NÃO — a tela de login é só visual, não autentica');
  linha(temMock ? 'bloq' : 'ok', 'Dados fictícios na tela', temMock ? 'AINDA PRESENTES — nada que o usuário digitar é gravado' : 'removidos');

  // ------------------------------------------------------------------ fim
  cabec('RESUMO');
  L.push('  Bloqueantes: ' + bloq.length);
  bloq.forEach(function (b, i) { L.push('    ' + (i + 1) + '. ' + b); });
  L.push('  Avisos: ' + avisos.length);
  avisos.forEach(function (a, i) { L.push('    ' + (i + 1) + '. ' + a); });
  L.push('');
  L.push(bloq.length === 0
    ? '  PRONTO PARA USO REAL.'
    : '  NÃO usar com gente de verdade enquanto houver bloqueante.');

  const texto = L.join('\n');
  console.log(texto);
  return texto;
}

/** Mesmo diagnóstico, enviado por e-mail — útil para rodar num gatilho semanal. */
function diagnosticarPorEmail() {
  const texto = diagnosticar();
  MailApp.sendEmail({
    to: emailDoDono(),
    subject: 'FC Salomé — diagnóstico ' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'dd/MM/yyyy'),
    body: texto
  });
  return 'enviado';
}

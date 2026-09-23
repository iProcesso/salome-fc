/**
 * Auth.gs — login próprio, sessão e senha.
 *
 * AVISO HONESTO: o Apps Script não tem bcrypt nem argon2. O que existe é SHA-256.
 * O que fazemos para compensar:
 *   - salt aleatório por usuário, gravado na linha;
 *   - "pepper" fora da planilha (ScriptProperties) — quem obtiver a planilha ainda não testa senhas;
 *   - iteração do digest para encarecer ataque offline;
 *   - comparação em tempo constante;
 *   - bloqueio progressivo e log de toda tentativa.
 * Isso é adequado para um sistema interno como o da Salomé. Ainda assim é mais fraco do que
 * autenticar pelo Google Workspace — se um dia todos tiverem conta Google, migre.
 */
const Auth = (function () {

  const ITERACOES = 3000;   // ~150-250 ms. Se o login passar de 300 ms, reduza.

  // ---------------------------------------------------------------- hash

  function pepper() {
    let p = Cfg.prop('PEPPER');
    if (!p) {
      p = Utilities.base64Encode(gerarBytes(32));
      Cfg.setProp('PEPPER', p);   // criado uma vez, nunca vai para o Git
    }
    return p;
  }

  function gerarBytes(n) {
    const b = [];
    for (let i = 0; i < n; i++) b.push(Math.floor(Math.random() * 256) - 128);
    return b;
  }

  function novoSalt() {
    return Utilities.base64Encode(gerarBytes(24));
  }

  function hash(senha, salt) {
    let atual = salt + senha + pepper();
    for (let i = 0; i < ITERACOES; i++) {
      atual = Utilities.base64Encode(
        Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, atual, Utilities.Charset.UTF_8));
    }
    return atual;
  }

  /** Comparação sem retorno antecipado. */
  function iguais(a, b) {
    a = String(a); b = String(b);
    if (a.length !== b.length) return false;
    let dif = 0;
    for (let i = 0; i < a.length; i++) dif |= (a.charCodeAt(i) ^ b.charCodeAt(i));
    return dif === 0;
  }

  // ---------------------------------------------------------------- login

  function login(email, senha, origem, userAgent) {
    email = String(email || '').trim().toLowerCase();
    const u = Repo.achar('USUARIOS', 'EMAIL', email);

    if (!u || u.STATUS !== 'ATIVO') {
      Log.acesso(email, null, 'LOGIN_FALHA', origem, userAgent, null, 'usuário inexistente ou inativo');
      throw new Error('E-mail ou senha inválidos.');
    }
    if (u.BLOQUEADO_ATE && new Date(u.BLOQUEADO_ATE) > new Date()) {
      Log.acesso(email, u.USUARIO_ID, 'BLOQUEIO', origem, userAgent, null, 'tentativa durante bloqueio');
      throw new Error('Acesso bloqueado temporariamente. Tente de novo em alguns minutos.');
    }

    if (!iguais(u.SENHA_HASH, hash(senha, u.SENHA_SALT))) {
      const tentativas = Number(u.TENTATIVAS_FALHA || 0) + 1;
      const max = Number(Cfg.param('LOGIN_TENTATIVAS_MAX', 5));
      u.TENTATIVAS_FALHA = tentativas;
      if (tentativas >= max) {
        u.BLOQUEADO_ATE = new Date(Date.now() + 15 * 60 * 1000);
        u.TENTATIVAS_FALHA = 0;
      }
      Repo.salvar('USUARIOS', u, null, { forcar: true });
      Log.acesso(email, u.USUARIO_ID, 'LOGIN_FALHA', origem, userAgent, null,
                 'tentativa ' + tentativas + ' de ' + max);
      throw new Error('E-mail ou senha inválidos.');
    }

    // sucesso
    u.TENTATIVAS_FALHA = 0;
    u.BLOQUEADO_ATE = '';
    u.ULTIMO_ACESSO = new Date();
    Repo.salvar('USUARIOS', u, null, { forcar: true });

    const ses = abrirSessao(u, origem, userAgent);
    Log.acesso(email, u.USUARIO_ID, 'LOGIN_OK', origem, userAgent, ses.sessaoId, '');

    return {
      token: ses.token,
      trocarSenha: String(u.SENHA_TROCAR).toUpperCase() === 'SIM'
                   || (u.SENHA_EXPIRA_EM && new Date(u.SENHA_EXPIRA_EM) < new Date()),
      usuario: publico(u)
    };
  }

  function publico(u) {
    const perfil = Repo.achar('PERFIS', 'PERFIL_ID', u.PERFIL_ID) || {};
    return {
      id: u.USUARIO_ID, nome: u.NOME, email: u.EMAIL,
      perfilId: u.PERFIL_ID, perfilNome: perfil.NOME || u.PERFIL_ID,
      escopoFilial: u.ESCOPO_FILIAL, limiteAlcada: Number(u.LIMITE_ALCADA || 0)
    };
  }

  // ---------------------------------------------------------------- sessão

  function abrirSessao(u, origem, userAgent) {
    const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
    const horas = Number(Cfg.param('SESSAO_HORAS', 8));
    const reg = {
      SESSAO_ID: Utilities.getUuid(),
      USUARIO_ID: u.USUARIO_ID,
      TOKEN_HASH: Utilities.base64Encode(
        Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8)),
      CRIADA_EM: new Date(),
      EXPIRA_EM: new Date(Date.now() + horas * 3600 * 1000),
      ORIGEM: origem || 'WEB',
      USER_AGENT: userAgent || '',
      ENCERRADA_EM: ''
    };
    Repo.salvar('SESSOES', reg, null, { forcar: true });
    return { token: token, sessaoId: reg.SESSAO_ID };
  }

  /** Chamada no início de TODA requisição. */
  function validar(token) {
    if (!token) throw new Error('SESSAO_INVALIDA');
    const th = Utilities.base64Encode(
      Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8));
    const s = Repo.achar('SESSOES', 'TOKEN_HASH', th);
    if (!s || s.ENCERRADA_EM) throw new Error('SESSAO_INVALIDA');
    if (new Date(s.EXPIRA_EM) < new Date()) throw new Error('SESSAO_EXPIRADA');

    const u = Repo.achar('USUARIOS', 'USUARIO_ID', s.USUARIO_ID);
    if (!u || u.STATUS !== 'ATIVO') throw new Error('SESSAO_INVALIDA');

    const p = publico(u);
    p.sessaoId = s.SESSAO_ID;
    p.origem = s.ORIGEM;
    return p;
  }

  function logout(token) {
    try {
      const ses = validar(token);
      const s = Repo.achar('SESSOES', 'SESSAO_ID', ses.sessaoId);
      s.ENCERRADA_EM = new Date();
      Repo.salvar('SESSOES', s, null, { forcar: true });
      Log.acesso(ses.email, ses.id, 'LOGOUT', ses.origem, '', ses.sessaoId, '');
    } catch (e) { /* sessão já inválida — nada a encerrar */ }
    return true;
  }

  // ---------------------------------------------------------------- senha

  function definirSenha(usuarioId, senha, forcarTroca) {
    if (String(senha).length < 8) throw new Error('A senha precisa ter ao menos 8 caracteres.');
    const u = Repo.achar('USUARIOS', 'USUARIO_ID', usuarioId);
    if (!u) throw new Error('Usuário não encontrado.');
    const dias = Number(Cfg.param('SENHA_VALIDADE_DIAS', 90));
    u.SENHA_SALT = novoSalt();
    u.SENHA_HASH = hash(senha, u.SENHA_SALT);
    u.SENHA_TROCAR = forcarTroca ? 'SIM' : 'NAO';
    u.SENHA_EXPIRA_EM = new Date(Date.now() + dias * 86400 * 1000);
    u.TENTATIVAS_FALHA = 0;
    u.BLOQUEADO_ATE = '';
    Repo.salvar('USUARIOS', u, null, { forcar: true });
    return true;
  }

  function trocarSenha(token, senhaAtual, senhaNova) {
    const ses = validar(token);
    const u = Repo.achar('USUARIOS', 'USUARIO_ID', ses.id);
    if (!iguais(u.SENHA_HASH, hash(senhaAtual, u.SENHA_SALT))) {
      throw new Error('Senha atual incorreta.');
    }
    definirSenha(ses.id, senhaNova, false);
    Log.acesso(ses.email, ses.id, 'SENHA_ALTERADA', ses.origem, '', ses.sessaoId, '');
    return true;
  }

  /** Reset pelo administrador: gera temporária, envia por e-mail e força troca. */
  function resetarSenha(usuarioId, ses) {
    const u = Repo.achar('USUARIOS', 'USUARIO_ID', usuarioId);
    if (!u) throw new Error('Usuário não encontrado.');
    const temp = Utilities.getUuid().replace(/-/g, '').substring(0, 10);
    definirSenha(usuarioId, temp, true);
    MailApp.sendEmail({
      to: u.EMAIL,
      subject: 'FC Salomé — senha temporária',
      body: 'Olá, ' + u.NOME + '.\n\n'
          + 'Sua senha temporária é: ' + temp + '\n\n'
          + 'Ela deve ser trocada no primeiro acesso.\n'
          + Cfg.prop('URL_APP', '') + '\n'
    });
    Log.acesso(u.EMAIL, usuarioId, 'SENHA_RESET', 'WEB', '', ses && ses.sessaoId, 'reset por ' + (ses && ses.email));
    return true;
  }

  return {
    login: login, validar: validar, logout: logout,
    definirSenha: definirSenha, trocarSenha: trocarSenha, resetarSenha: resetarSenha,
    hash: hash, novoSalt: novoSalt, publico: publico
  };
})();

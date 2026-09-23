/* ==========================================================================
   PONTE COM O SERVIDOR
   --------------------------------------------------------------------------
   Uma função só chega ao servidor: api(acao, payload, token). O roteador do
   Code.gs resolve sessão → permissão → execução → log. Nenhuma outra função
   do backend fica exposta ao navegador.

   google.script.run não devolve Promise, então embrulhamos. E ele só existe
   dentro de uma página servida pelo HtmlService — por isso este app nunca
   roda abrindo o HTML direto do GitHub Pages.
   ========================================================================== */
const API = {
  token: null,

  chamar(acao, payload) {
    return new Promise((ok, falhou) => {
      if (typeof google === 'undefined' || !google.script || !google.script.run) {
        falhou(new Error('Esta página precisa ser aberta pela URL do app (…/exec). ' +
          'Abrindo o arquivo direto, não existe ponte com o servidor.'));
        return;
      }
      google.script.run
        .withSuccessHandler(r => {
          if (!r) { falhou(new Error('O servidor não respondeu.')); return; }
          if (r.ok) { ok(r.dados); return; }
          const e = new Error(r.mensagem || 'Falha no servidor.');
          e.codigo = r.codigo;
          falhou(e);
        })
        .withFailureHandler(e => falhou(new Error(e && e.message ? e.message : String(e))))
        .api(acao, payload || {}, API.token);
    });
  },

  /** Guarda o token entre recarregamentos da aba. Falha silenciosa é aceitável:
      sem ele a pessoa só faz login de novo. */
  guardar(t) {
    API.token = t;
    try { sessionStorage.setItem('fc_token', t || ''); } catch (e) { /* aba privada */ }
  },
  recuperar() {
    try { API.token = sessionStorage.getItem('fc_token') || null; } catch (e) { API.token = null; }
    return API.token;
  },
  esquecer() {
    API.token = null;
    try { sessionStorage.removeItem('fc_token'); } catch (e) { /* ok */ }
  }
};

/* ---------- carregando ---------- */
function carregando(on, texto) {
  const el = document.getElementById('lgLoad');
  if (!el) return;
  el.classList.toggle('off', !on);
  if (texto) document.getElementById('lgLoadTxt').textContent = texto;
}

/* ---------- login ---------- */
function erroLogin(msg) {
  const e = document.getElementById('lgErro');
  e.style.display = msg ? 'flex' : 'none';
  e.innerHTML = msg ? `<div><b>Não foi possível entrar</b><p>${msg}</p></div>` : '';
}

async function entrar() {
  const btn = document.getElementById('lgBtn');
  const email = document.getElementById('lgMail').value.trim();
  const senha = document.getElementById('lgSenha').value;
  if (!email || !senha) { erroLogin('Informe e-mail e senha.'); return; }

  btn.disabled = true; btn.textContent = 'Entrando…'; erroLogin('');
  try {
    const r = await API.chamar('auth.login', { email, senha, origem: 'WEB', userAgent: navigator.userAgent });
    API.guardar(r.token);
    document.getElementById('lgSenha').value = '';
    if (r.trocarSenha) {
      document.getElementById('loginWrap').classList.remove('on');
      document.getElementById('trocaWrap').classList.add('on');
      return;
    }
    await carregarTudo();
  } catch (e) {
    erroLogin(e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}

async function salvarSenha() {
  const atual = document.getElementById('tcAtual').value;
  const nova = document.getElementById('tcNova').value;
  const conf = document.getElementById('tcConf').value;
  const err = document.getElementById('tcErro');
  const mostrar = m => { err.style.display = m ? 'flex' : 'none';
    err.innerHTML = m ? `<div><b>Não deu</b><p>${m}</p></div>` : ''; };

  if (nova !== conf) { mostrar('As duas senhas novas não são iguais.'); return; }
  if (nova.length < 8) { mostrar('A nova senha precisa de pelo menos 8 caracteres.'); return; }
  try {
    await API.chamar('auth.trocarSenha', { atual, nova });
    document.getElementById('trocaWrap').classList.remove('on');
    await carregarTudo();
  } catch (e) { mostrar(e.message); }
}

async function sair() {
  try { await API.chamar('auth.logout', {}); } catch (e) { /* segue assim mesmo */ }
  API.esquecer();
  location.reload();
}

/* ---------- abertura ---------- */

/** Uma chamada traz tudo. No Apps Script o custo é a ida e volta, não o tamanho. */
async function carregarTudo() {
  carregando(true, 'Carregando a base…');
  try {
    const d = await API.chamar('vista.abrir', {});
    aplicar(d);
    document.getElementById('loginWrap').classList.remove('on');
    document.getElementById('trocaWrap').classList.remove('on');
    carregando(false);
    renderMenu(); render();
  } catch (e) {
    carregando(false);
    if (e.codigo === 'SESSAO_INVALIDA' || e.codigo === 'SESSAO_EXPIRADA') {
      API.esquecer();
      document.getElementById('loginWrap').classList.add('on');
      erroLogin('Sua sessão expirou. Entre de novo.');
      return;
    }
    document.getElementById('loginWrap').classList.add('on');
    erroLogin(e.message);
  }
}

/** Joga os dados do servidor nas variáveis que as telas já desenham. */
function aplicar(d) {
  EU = d.usuario;
  ROLE = d.usuario.perfil;
  PERMS[ROLE] = normalizarPermissoes(d.permissoes);

  const c = d.cadastros || {};
  PLANO = (c.contas || []).map(x => [x.CODIGO, x.DESCRICAO, x.TIPO, x.GRUPO_DRE, x.NATUREZA, x.DESCRICAO_CONTABIL || '']);
  FORN  = (c.fornecedores || []).map(x => [x.FORNECEDOR_ID, x.RAZAO_SOCIAL, x.TIPO || 'PJ', x.OPTANTE_SIMPLES || '', x.CATEGORIAS || '']);
  CAT   = (c.categorias || []).map(x => [x.CATEGORIA_ID, x.BLOCO, x.NOME, x.EXEMPLOS, x.CONTA_PJ, x.CONTA_PF,
                                          x.CENTRO_PADRAO, x.EXIGE_PLACA, x.EXIGE_ANEXO, x.RETENCAO, x.ANTECEDENCIA_MIN_DIAS]);
  CENTROS = (c.centros || []).map(x => [x.CENTRO_ID, x.NOME, x.DESCRICAO]);
  USUARIOS = (c.usuarios || []).map(x => [x.USUARIO_ID, x.NOME, x.EMAIL, x.PERFIL_ID,
                                          x.FILIAIS || 'Todas', x.LIMITE_ALCADA || '—', x.STATUS, x.ULTIMO_ACESSO || '—']);
  FILIAIS_CAD = c.filiais || [];
  AREAS_CAD   = c.areas || [];
  CONDICOES_CAD = c.condicoes || [];
  FORMAS_CAD  = c.formas || [];

  SOL = d.solicitacoes || [];
  ALC = d.alcadas || [];
  FLUXO_SRV = d.fluxo || {};
  WEEKS = FLUXO_SRV.semanas || [];
  WDATE = FLUXO_SRV.datas || [];
  FLOW  = FLUXO_SRV;
  SALDO_MINIMO = (d.parametros && d.parametros.saldoMinimo) || 0;
  VERSAO_APP = d.versao || '';

  recalcular();

  document.getElementById('uname').textContent = EU.nome;
  document.getElementById('uperfil').textContent = PERFIL_NOME[ROLE] || ROLE;
  document.getElementById('avatar').textContent = EU.iniciais;
}

let FILIAIS_CAD = [], AREAS_CAD = [], CONDICOES_CAD = [], FORMAS_CAD = [], FLUXO_SRV = {};
let SALDO_MINIMO = 0, VERSAO_APP = '';

function recalcular() {
  PEND = SOL.filter(s => ['Aguardando Aprovação', 'Reprogramado', 'Aguardando caixa'].includes(s.st));
  PC_MAP = {}; PLANO.forEach(p => PC_MAP[p[0]] = { desc:p[1], tipo:p[2], g:p[3], n:p[4], contabil:p[5] });
  CAT_MAP = {}; CAT.forEach(c => CAT_MAP[c[0]] = { bloco:c[1], nome:c[2], ex:c[3], pj:c[4], pf:c[5],
    centro:c[6], placa:c[7]==='SIM', anexo:c[8]==='SIM', ret:c[9], ant:c[10] });
  FORN_MAP = {}; FORN.forEach(f => FORN_MAP[f[0]] = { nome:f[1], tipo:f[2], simples:f[3], cats:f[4] });
}

/** O servidor devolve a matriz por recurso; a tela pensa por tela e por ação. */
function normalizarPermissoes(p) {
  const base = { ver: [], acao: { incluir: [], alterar: [], inativar: [], aprovar: [] },
                 limite: 0, escopo: 'PROPRIO' };
  if (!p) return base;
  if (p.limite !== undefined) base.limite = Number(p.limite) || 0;

  const TELA = {
    SOLICITACAO:['inicio','minhas','nova','kanban'], APROVACAO:['aprovacoes'],
    TITULO_PAGAR:['pagar'], TITULO_RECEBER:['receber'], RATEIO:['rateio'],
    ORCAMENTO:['orcamento','gerencial'], PLANO_CONTAS:['plano'], CATEGORIA:['plano'],
    CENTRO_CUSTO:['filiais'], FORNECEDOR:['fornecedores'], FILIAL:['filiais'], AREA:['filiais'],
    USUARIO:['usuarios'], PERFIL:['perfis'], PARAMETRO:['params'], LOG:['logs'], IMPORTACAO:['import']
  };
  const recursos = p.recursos || p;
  Object.keys(recursos).forEach(r => {
    const a = recursos[r] || {};
    if (a.VER || a.ver) (TELA[r] || []).forEach(t => { if (base.ver.indexOf(t) < 0) base.ver.push(t); });
    ['INCLUIR','ALTERAR','INATIVAR','APROVAR'].forEach(k => {
      if (a[k] || a[k.toLowerCase()]) base.acao[k.toLowerCase()].push(r);
    });
  });
  if (base.ver.indexOf('inicio') < 0) base.ver.push('inicio');
  // O escopo mora no recurso SOLICITACAO: é ele que diz se a pessoa vê só o que lançou.
  const sol = recursos.SOLICITACAO || {};
  base.escopo = sol.escopo || sol.ESCOPO || p.escopo || 'PROPRIO';
  return base;
}

/* ---------- ações que vão ao servidor ---------- */

/** Recarrega só o que muda. Não refaz cadastro — cadastro não muda a cada minuto. */
async function recarregar(msg) {
  try {
    const d = await API.chamar('vista.atualizar', {});
    SOL = d.solicitacoes || SOL;
    if (d.fluxo) { FLUXO_SRV = d.fluxo; FLOW = d.fluxo; WEEKS = d.fluxo.semanas; WDATE = d.fluxo.datas; }
    recalcular();
    render();
    if (msg) toast(msg, 'ok');
  } catch (e) { toast('Não consegui recarregar: ' + e.message, 'cr'); }
}

/** Mover card no quadro. A regra que vale é a do servidor — a da tela é só resposta rápida. */
async function moverNoServidor(id, etapa, pedido) {
  try {
    const r = await API.chamar('fluxo.mover', { id, etapa, pedido });
    await recarregar(r.mensagem);
    return true;
  } catch (e) {
    toast('Movimento recusado — ' + e.message, 'cr');
    const el = document.getElementById('kc-' + id);
    if (el) { el.classList.add('nega'); setTimeout(() => el.classList.remove('nega'), 320); }
    return false;
  }
}

/* ---------- abertura da página ---------- */
async function abrirApp() {
  renderMenu();
  if (API.recuperar()) { await carregarTudo(); return; }
  carregando(false);
  document.getElementById('loginWrap').classList.add('on');
}

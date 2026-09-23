# -*- coding: utf-8 -*-
"""
build_app.py — gera app.html (versão OFICIAL) a partir de index.html (protótipo).

Por que gerar em vez de manter dois arquivos à mão: as views são as mesmas. O que muda
é a origem dos dados e o fato de haver login. Duplicar 2.000 linhas de tela garantiria
que as duas versões divergissem na primeira correção.

O que este script faz, na ordem:
  1. tira a faixa de protótipo e a prévia de login
  2. troca os dados fictícios por variáveis vazias que o servidor preenche
  3. troca o seletor de perfil por quem realmente entrou
  4. instala a ponte google.script.run, a tela de login e a sequência de abertura
  5. faz as ações (salvar, mover, aprovar) irem ao servidor em vez de só dar toast
"""
import re, sys

src = open('index.html').read()
s = src

# ---------------------------------------------------------------- 1. protótipo fora
i = s.index('<div class="protobar">')
j = s.index('</div>\n\n<div class="login-wrap"', i)
s = s[:i] + s[j+len('</div>\n\n'):]

s = s.replace(""".protobar{background:var(--navy);color:var(--surface);padding:7px 18px;font-size:12px;display:flex;""",
              """.protobar{display:none;background:var(--navy);color:var(--surface);padding:7px 18px;font-size:12px;""")

# ---------------------------------------------------------------- 2. login de verdade
i = s.index('<div class="login-wrap" id="loginWrap">')
j = s.index('</div>\n\n<header class="topbar">', i) + len('</div>\n\n')
logo = re.search(r'<img src="(data:image/png;base64,[^"]+)" alt="Expresso Salomé" style="height:30px"', s[i:j]).group(1)

login = '''<div class="login-wrap on" id="loginWrap">
  <div class="login-card">
    <div class="lg-brand">
      <div class="logo-plate" style="padding:6px 12px"><img src="__LOGO__" alt="Expresso Salomé" style="height:30px"></div>
      <div><div style="font-size:11.5px;color:var(--ink-3)">FC · Apontamento Financeiro de Compras</div></div>
    </div>
    <form id="lgForm" onsubmit="event.preventDefault();entrar()">
      <div class="f"><label for="lgMail">E-mail</label>
        <input id="lgMail" type="email" autocomplete="username" required autofocus></div>
      <div class="f" style="margin-top:12px"><label for="lgSenha">Senha</label>
        <input id="lgSenha" type="password" autocomplete="current-password" required></div>
      <div id="lgErro" class="verdict cr" style="display:none;margin-top:14px"></div>
      <button class="btn pri" id="lgBtn" type="submit"
        style="justify-content:center;padding:10px;width:100%;margin-top:16px">Entrar</button>
    </form>
    <div style="font-size:11.5px;color:var(--ink-3);line-height:1.5;border-top:1px solid var(--line);padding-top:12px;margin-top:16px">
      Senha guardada como <b>hash SHA-256 com salt por usuário</b> — nunca em texto.
      Bloqueio após tentativas seguidas e toda tentativa registrada no log de acesso.
    </div>
  </div>
</div>

<div class="troca-wrap" id="trocaWrap">
  <div class="login-card">
    <h2 style="font-size:16px;margin:0 0 4px">Troque a senha para continuar</h2>
    <p style="font-size:12px;color:var(--ink-3);margin:0 0 16px">
      A senha atual é provisória ou expirou. Escolha uma nova antes de entrar.</p>
    <form onsubmit="event.preventDefault();salvarSenha()">
      <div class="f"><label for="tcAtual">Senha atual</label>
        <input id="tcAtual" type="password" autocomplete="current-password" required></div>
      <div class="f" style="margin-top:12px"><label for="tcNova">Nova senha</label>
        <input id="tcNova" type="password" autocomplete="new-password" minlength="8" required>
        <span class="hint">Mínimo de 8 caracteres.</span></div>
      <div class="f" style="margin-top:12px"><label for="tcConf">Repita a nova senha</label>
        <input id="tcConf" type="password" autocomplete="new-password" minlength="8" required></div>
      <div id="tcErro" class="verdict cr" style="display:none;margin-top:14px"></div>
      <button class="btn pri" type="submit" style="justify-content:center;padding:10px;width:100%;margin-top:16px">
        Salvar e entrar</button>
    </form>
  </div>
</div>

'''.replace('__LOGO__', logo)
s = s[:i] + login + s[j:]

s = s.replace('.login-wrap{position:fixed;inset:0;background:rgba(10,16,24,.66);display:none;place-items:center;z-index:80;padding:20px}',
"""/* O app inteiro fica atrás da tela de login até a sessão existir. */
.login-wrap{position:fixed;inset:0;background:var(--paper);display:none;place-items:center;z-index:120;padding:20px}
.login-wrap.on{display:grid}
.troca-wrap{position:fixed;inset:0;background:var(--paper);display:none;place-items:center;z-index:121;padding:20px}
.troca-wrap.on{display:grid}
.lgcarregando{position:fixed;inset:0;background:var(--paper);display:grid;place-items:center;z-index:130}
.lgcarregando.off{display:none}
.lgcarregando .sp{width:26px;height:26px;border:2.5px solid var(--line-2);border-top-color:var(--navy);
  border-radius:50%;animation:gira .7s linear infinite}
@keyframes gira{to{transform:rotate(360deg)}}""")

# ---------------------------------------------------------------- 3. quem entrou
s = s.replace("""      <select id="roleSel" aria-label="Perfil">
        <option value="SOLICITANTE">Solicitante</option>
        <option value="FINANCEIRO">Financeiro</option>
        <option value="DIRETORIA" selected>Diretoria</option>
        <option value="ADMIN">Administrador</option>
      </select>""",
"""      <div class="rl" id="uperfil">—</div>""")
s = s.replace("""<div class="who">
      <div class="av" id="avatar">CS</div>""",
"""<button class="tb-btn" id="sairBtn" aria-label="Sair" data-tip="Encerrar a sessão">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"
      stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
  </button>
  <div class="who">
      <div class="av" id="avatar">–</div>""")
s = s.replace("""  <div class="who">
    <div class="av" id="avatar">CS</div>""",
"""  <button class="tb-btn" id="sairBtn" aria-label="Sair" data-tip="Encerrar a sessão">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"
      stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
  </button>
  <div class="who">
    <div class="av" id="avatar">–</div>""")
s = s.replace('<div class="nm" id="uname">Celso Martins</div>', '<div class="nm" id="uname">—</div>')

# tela de carregamento, logo depois do <body>
s = s.replace('<header class="topbar">',
"""<div class="lgcarregando" id="lgLoad"><div style="text-align:center">
  <div class="sp" style="margin:0 auto 14px"></div>
  <div style="font-size:12.5px;color:var(--ink-3)" id="lgLoadTxt">Abrindo…</div>
</div></div>

<header class="topbar">""", 1)

# ---------------------------------------------------------------- 4. dados vêm do servidor
def vazia(nome, valor, s):
    """Acha o literal inteiro contando colchetes — os arrays têm formatos diferentes
    (uns terminam em '\\n];', outros em ']];' na mesma linha)."""
    m = re.search(r'^const\s+%s\s*=\s*\[' % nome, s, re.M)
    if not m:
        raise SystemExit('não achei a declaração de ' + nome)
    i = m.start()
    k = m.end() - 1          # posição do '[' de abertura
    prof, dentro, aspas = 0, False, ''
    while k < len(s):
        ch = s[k]
        if dentro:
            if ch == '\\': k += 2; continue
            if ch == aspas: dentro = False
        elif ch in '\'"':
            dentro, aspas = True, ch
        elif ch == '[': prof += 1
        elif ch == ']':
            prof -= 1
            if prof == 0:
                fim = s.index(';', k) + 1
                return s[:i] + 'let %s = %s;' % (nome, valor) + s[fim:]
        k += 1
    raise SystemExit('literal de %s não fecha' % nome)

for nome, valor in [('SOL','[]'), ('PLANO','[]'), ('FORN','[]'), ('CAT','[]'),
                    ('CENTROS','[]'), ('USUARIOS','[]')]:
    s = vazia(nome, valor, s)

s = s.replace("const PEND = SOL.filter(s=>['Aguardando Aprovação','Reprogramado'].includes(s.st));",
              "let PEND = [];")
s = s.replace("const WEEKS=['S1','S2','S3','S4','S5','S6','S7','S8','S9','S10','S11','S12'];",
              "let WEEKS=[];")
s = s.replace("const WDATE=['31/08','07/09','14/09','21/09','28/09','05/10','12/10','19/10','26/10','02/11','09/11','16/11'];",
              "let WDATE=[];")
i = s.index('const FLOW={'); j = s.index('\n};', i) + 3
s = s[:i] + 'let FLOW={saldoAcu:[],sit:[],previsto:[],comprometido:[],realizado:[],entradas:[],saidas:[]};\n' + s[j:]

i = re.search(r'^const ALC=\[', s, re.M).start(); j = s.index(']];', i) + 3
s = s[:i] + 'let ALC=[];' + s[j:]

s = s.replace("let ROLE='DIRETORIA';", "let ROLE='SOLICITANTE';\nlet EU={nome:'',iniciais:'–',perfil:''};")
s = s.replace("const USERS={SOLICITANTE:['Celso Martins','CS'],FINANCEIRO:['Ana Paula Cruz','AC'],\n             DIRETORIA:['Carlos Salomé','CS'],ADMIN:['Kleber Zumiotti','KZ']};",
              "const USERS=new Proxy({},{get:()=>[EU.nome, EU.iniciais]});")

# data de hoje deixa de ser fixa
s = s.replace("const HOJE_KB = new Date('2026-09-21T00:00:00');",
              "let HOJE_KB = new Date(); HOJE_KB.setHours(0,0,0,0);")
s = s.replace("const dt=new Date(dtTxt+'T00:00:00'), hoje=new Date('2026-09-21T00:00:00');",
              "const dt=new Date(dtTxt+'T00:00:00'), hoje=new Date(); hoje.setHours(0,0,0,0);")
s = s.replace(" inicio:'Sua posição de hoje — 21 de setembro de 2026',",
              " inicio:'Sua posição de hoje',")
s = s.replace("<div class=\"crumb\">", "<div class=\"crumb\">")

# o card do formulário deixa de fingir número
s = s.replace("""${campo('fNum','Nº da solicitação',false,'<input class="calc" value="SOL-2026-00033" readonly>')}
    ${campo('fData','Data da solicitação',false,'<input class="calc" value="21/09/2026" readonly>')}""",
"""${campo('fNum','Nº da solicitação',false,'<input class="calc" id="fNum" value="— gerado ao enviar —" readonly>')}
    ${campo('fData','Data da solicitação',false,`<input class="calc" value="${new Date().toLocaleDateString('pt-BR')}" readonly>`)}""")


# ---------------------------------------------------------------- 4b. sobras do protótipo
# O seletor de perfil sumiu: quem entrou define o perfil, e ninguém troca de papel no app.
i = s.index("document.getElementById('roleSel').onchange=e=>{")
j = s.index('};', s.index('toast(', i)) + 3
s = s[:i] + "document.getElementById('sairBtn').onclick=sair;\n" + s[j:]

s = s.replace("function openLogin(){document.getElementById('loginWrap').classList.add('on')}\nfunction closeLogin(){document.getElementById('loginWrap').classList.remove('on')}",
              "function closeLogin(){}")

# a prévia de celular continua: é a visão executiva de aprovação, não enfeite


# ---------------------------------------------------------------- 4c. ações vão ao servidor
# decidir aprovação
s = s.replace(
"function decide(id,acao){toast(`${id} ${acao.toLowerCase()}. Status gravado, log de atividade registrado e e-mail enviado ao solicitante.`)}",
"""async function decide(id,acao){
  const mapa={'Aprovada':'APROVAR','Reprogramada':'REPROGRAMAR','Reprovada':'REPROVAR'};
  let motivo='';
  if(acao!=='Aprovada'){
    motivo=prompt(acao==='Reprogramada'
      ? 'Para qual data reprogramar, e por quê?'
      : 'Motivo da reprovação:');
    if(motivo===null) return;
  }
  try{
    await API.chamar('sol.decidir',{id:id, decisao:mapa[acao], motivo:motivo});
    await recarregar(id.slice(-5)+' '+acao.toLowerCase()+'. Decisão gravada e o solicitante avisado por e-mail.');
  }catch(e){ toast('Não consegui gravar: '+e.message,'cr'); }
}""")

# enviar solicitação
s = s.replace("""  toast('Solicitação SOL-2026-00033 enviada para aprovação. Log registrado.');
}""",
"""  enviarAoServidor();
}

async function enviarAoServidor(){
  const btn=document.getElementById('btnEnviar');
  const antes=btn.innerHTML; btn.disabled=true; btn.textContent='Enviando…';
  const num=v=>Number(String(v).replace(/\\./g,'').replace(',','.'))||0;
  try{
    const r=await API.chamar('sol.salvar',{
      enviar:true,
      categoriaId:val('fCat'), fornecedorId:val('fForn'),
      areaId:val('fArea'), filialEmissao:val('fFil'), centroCusto:val('fCentro'),
      placa:val('fPlaca'), descricao:val('fDesc'),
      valorBruto:num(val('fVal')), condicaoId:val('fCond'), formaId:val('fForma'),
      dataPrevista:val('fDt')
    });
    const id=(r&&(r.id||(r.registro&&r.registro.SOLICITACAO_ID)))||'';
    FORM={aberto:{1:false,2:false,3:false,4:false},tocado:{},tentou:false};
    await recarregar(id? id+' enviada para aprovação. Registrada no log.' : 'Solicitação enviada.');
    go('minhas');
  }catch(e){
    toast('Não consegui enviar: '+e.message,'cr');
  }finally{ btn.disabled=false; btn.innerHTML=antes; }
}""")

# botão de exemplo não faz sentido no app oficial
s = s.replace("""<button class="btn" onclick="preencherExemplo()">Preencher exemplo</button>`)+""", "`)+")

# rascunho de verdade
s = s.replace("""onclick="toast('Rascunho salvo no navegador. Você pode fechar e voltar depois.')">Salvar rascunho</button>""",
              """onclick="salvarRascunho()">Salvar rascunho</button>""")
s = s.replace("async function enviarAoServidor(){",
"""async function salvarRascunho(){
  const num=v=>Number(String(v).replace(/\\./g,'').replace(',','.'))||0;
  try{
    await API.chamar('sol.salvar',{enviar:false,
      categoriaId:val('fCat'), fornecedorId:val('fForn'), areaId:val('fArea'),
      filialEmissao:val('fFil'), centroCusto:val('fCentro'), placa:val('fPlaca'),
      descricao:val('fDesc'), valorBruto:num(val('fVal')), condicaoId:val('fCond'),
      formaId:val('fForma'), dataPrevista:val('fDt')});
    await recarregar('Rascunho salvo. Ele aparece em Minhas solicitações.');
  }catch(e){ toast('Não consegui salvar: '+e.message,'cr'); }
}

async function enviarAoServidor(){""")

# mover card: a regra que vale é a do servidor
s = s.replace("""  const c = SOL.find(x=>x.id===id);
  const antes = c.etapa || 'APROVAR';
  c.etapa = alvo;""",
"""  moverNoServidor(id, alvo);
  return;
  /* eslint-disable no-unreachable */
  const c = SOL.find(x=>x.id===id);
  const antes = c.etapa || 'APROVAR';
  c.etapa = alvo;""")
s = s.replace("""  c.pre.pedido=true; c.pedido=e.value.trim();
  closeDrawer();
  KB.arrastando=id;
  kbDrop({preventDefault(){},dataTransfer:{getData:()=>id}}, 'RECEBER');""",
"""  const pedido=e.value.trim();
  closeDrawer();
  moverNoServidor(id, 'RECEBER', pedido);""")

# descrição da conta: grava de verdade
s = s.replace("""function salvarTexto(cod){
  const e=document.getElementById('pcNovo'), p=PLANO.find(x=>x[0]===cod);
  if(e&&e.value.trim()) p[1]=e.value.trim();
  closeDrawer(); go('plano');
  toast(cod+': descrição alterada. Registrado no log.');
}""",
"""async function salvarTexto(cod){
  const e=document.getElementById('pcNovo');
  if(!e||!e.value.trim()) return;
  try{
    await API.chamar('cad.salvar',{tabela:'PLANO_CONTAS',
      registro:{CONTA_ID:'CT-'+cod, CODIGO:cod, DESCRICAO:e.value.trim()}});
    const p=PLANO.find(x=>x[0]===cod); if(p) p[1]=e.value.trim();
    recalcular(); closeDrawer(); go('plano');
    toast(cod+': descrição alterada. Registrado no log.','ok');
  }catch(err){ toast('Não consegui gravar: '+err.message,'cr'); }
}""")


# ---------------------------------------------------------------- 4d. o que o servidor reescreve
# Estes três mapas eram const no protótipo porque nasciam prontos. Aqui eles são
# refeitos a cada carga, então precisam ser let — atribuir a const estoura em silêncio
# no meio do bootstrap e a tela fica no login sem dizer por quê.
s = s.replace("const PC_MAP={}; PLANO.forEach", "let PC_MAP={}; PLANO.forEach")
s = s.replace("const CAT_MAP={}; CAT.forEach", "let CAT_MAP={}; CAT.forEach")
s = s.replace("const FORN_MAP={}; FORN.forEach", "let FORN_MAP={}; FORN.forEach")

# a alçada do usuário vem do perfil, não de um número escrito no código
s = s.replace("""function podeAprovarValor(v){
  if(ROLE==='DIRETORIA') return true;
  if(ROLE==='FINANCEIRO') return v<=10000;
  return false;
}""",
"""function podeAprovarValor(v){
  const p=PERMS[ROLE]||{};
  const aprov=(p.acao&&p.acao.aprovar)||[];
  // A permissão de aprovar pode vir marcada em SOLICITACAO ou em APROVACAO — as duas
  // querem dizer a mesma coisa, e qual delas a planilha usa não é problema da tela.
  if(!aprov.includes('SOLICITACAO') && !aprov.includes('APROVACAO')) return false;
  return Number(v) <= Number(p.limite||0);
}""")

# nome da alçada em vez do código, quando der
s = s.replace("motivo:m0(c.val)+' exige '+c.alc+'. Seu perfil não cobre esse valor.'}",
              "motivo:'R$ '+m0(c.val)+' exige '+nomeAlcada(c.alc)+'. Seu perfil não cobre esse valor.'}")
s = s.replace("function podeAprovarValor(v){",
"""function nomeAlcada(id){
  const a=(ALC||[]).find(x=>x[1]&&String(x[1]).includes(id));
  return a?a[1]:(id||'uma alçada maior');
}
function podeAprovarValor(v){""")


# ---------------------------------------------------------------- 4e. nada inventado na tela
# Um app oficial não pode mostrar número que ninguém calculou. Os KPIs e o painel de
# consistência do protótipo eram texto fixo — aqui eles saem dos dados ou não saem.
s = s.replace("""    <div class="card kpi a"><div class="l">Saldo projetado hoje</div><div class="v">108.080</div><div class="d">semana S3 · 14 a 20/09</div></div>
    <div class="card kpi d2"><div class="l">Semanas em atenção</div><div class="v">4</div><div class="d">S1, S2, S3 e S6</div></div>
    <div class="card kpi c"><div class="l">Realizado no mês</div><div class="v">717.020</div><div class="d">70% do orçado de setembro</div></div>""",
"""    <div class="card kpi a"><div class="l">Saldo projetado desta semana</div>
      <div class="v">${WEEKS.length?m0(FLOW.saldoAcu[0]):'—'}</div>
      <div class="d">${WEEKS.length?WEEKS[0]+' · a partir de '+WDATE[0]:'fluxo ainda não projetado'}</div></div>
    <div class="card kpi d2"><div class="l">Semanas em atenção</div>
      <div class="v">${(FLOW.sit||[]).filter(x=>x!=='OK').length}</div>
      <div class="d">${(FLOW.sit||[]).map((x,i)=>x!=='OK'?WEEKS[i]:null).filter(Boolean).join(', ')||'nenhuma nas '+WEEKS.length+' semanas'}</div></div>
    <div class="card kpi c"><div class="l">Comprometido nas 12 semanas</div>
      <div class="v">${m0((FLOW.comprometido||[]).reduce((a,b)=>a+b,0))}</div>
      <div class="d">${m0((FLOW.previsto||[]).reduce((a,b)=>a+b,0))} ainda como previsto</div></div>""")

s = s.replace("""        ${cons('2 notas com valor divergente do aprovado','Precisam de reaprovação do saldo antes do pagamento','cr','pagar')}
        ${cons('1 solicitação fora do prazo mínimo','Material de escritório pedido com 5 dias; a regra exige 7','wa','aprovacoes')}
        ${cons('3 solicitações sem orçamento anexo','A classificação exige anexo de cotação','wa','minhas')}
        ${cons('Rateio conferido','Todas as notas somam 100% entre as filiais','ok','rateio')}
        ${cons('Plano de contas sincronizado','22 classificações ativas, última importação em 20/09','ok','plano')}""",
"""        ${consistencia()}""")

s = s.replace("const cons=(t,d,k,go_)=>",
"""/** Cada linha aqui é uma contagem sobre os dados reais. Quando dá zero, vira um OK. */
function consistencia(){
  const hoje=new Date(); hoje.setHours(0,0,0,0);
  const atrasadas = SOL.filter(s=>s.prevIso && new Date(s.prevIso+'T00:00:00')<hoje
                                 && ['PAGO','REPROVADO','CANCELADO'].indexOf(s.status)<0);
  const semAnexo  = SOL.filter(s=>s.pre && s.pre.anexo===false);
  const semPlaca  = SOL.filter(s=>s.pre && s.pre.placa===false);
  const semRateio = SOL.filter(s=>s.pre && s.pre.rateio===false);
  const foraPrazo = SOL.filter(s=>s.ant==='FORA DO PRAZO'
                                 && ['PAGO','REPROVADO','CANCELADO'].indexOf(s.status)<0);
  const semCaixa  = SOL.filter(s=>s.rec==='REPROGRAMAR');
  const plural=(n,a,b)=>n+' '+(n===1?a:b);

  const linhas=[];
  if(atrasadas.length) linhas.push(cons(plural(atrasadas.length,'solicitação em atraso','solicitações em atraso'),
    'A data prevista de pagamento já passou e o título não foi pago.','cr','pagar'));
  if(semCaixa.length) linhas.push(cons(plural(semCaixa.length,'solicitação sem caixa na semana','solicitações sem caixa na semana'),
    'A recomendação é reprogramar na reunião.','wa','aprovacoes'));
  if(foraPrazo.length) linhas.push(cons(plural(foraPrazo.length,'solicitação fora do prazo mínimo','solicitações fora do prazo mínimo'),
    'Pedidas com menos antecedência do que a categoria exige.','wa','aprovacoes'));
  if(semAnexo.length) linhas.push(cons(plural(semAnexo.length,'solicitação sem orçamento anexo','solicitações sem orçamento anexo'),
    'A categoria exige a cotação anexada para seguir.','wa','kanban'));
  if(semPlaca.length) linhas.push(cons(plural(semPlaca.length,'gasto de frota sem placa','gastos de frota sem placa'),
    'Sem a placa não há como apurar custo por veículo.','wa','kanban'));
  if(semRateio.length) linhas.push(cons(plural(semRateio.length,'rateio que não fecha 100%','rateios que não fecham 100%'),
    'A soma precisa fechar nos dois eixos: filial e centro de custo.','cr','rateio'));

  if(!linhas.length) linhas.push(cons('Nada pendente de conferência',
    plural(SOL.length,'solicitação no período','solicitações no período')+
    ', com os pré-requisitos em ordem.','ok','minhas'));
  linhas.push(cons('Plano de contas carregado',
    plural(PLANO.length,'conta','contas')+' e '+
    plural(CAT.length,'categoria de compra ativa','categorias de compra ativas')+'.','ok','plano'));
  return linhas.join('');
}

const cons=(t,d,k,go_)=>""")


# ---------------------------------------------------------------- 4f. o formulário lê os cadastros
s = s.replace("""${campo('fArea','Área solicitante',true,sel('fArea',['Manutenção / Frota','Administrativo','Operação Armazém','TI','RH','Diretoria']))}""",
"""${campo('fArea','Área solicitante',true,sel('fArea',AREAS_CAD.map(a=>({v:a.AREA_ID,t:a.NOME||a.AREA_ID}))))}""")
s = s.replace("""${campo('fFil','Filial que emite a NF',true,sel('fFil',[{v:'RP',t:'RP · Rio Preto (Matriz)'},{v:'CPQ',t:'CPQ · Campinas'},{v:'OSA',t:'OSA · Osasco'},{v:'SPO',t:'SPO · São Paulo'}]))}""",
"""${campo('fFil','Filial que emite a NF',true,sel('fFil',FILIAIS_CAD.map(f=>({v:f.FILIAL_ID,t:(f.CODIGO||f.FILIAL_ID)+' · '+(f.NOME||'')}))))}""")
s = s.replace("""${campo('fCond','Condição de pagamento',false,sel('fCond',['À vista','Fora semana / próx. quarta','15 dias','28 dias','30/60 dias'],'— usar a padrão da categoria —'))}""",
"""${campo('fCond','Condição de pagamento',false,sel('fCond',CONDICOES_CAD.map(c=>({v:c.CONDICAO_ID,t:c.NOME||c.CONDICAO_ID})),'— usar a padrão da categoria —'))}""")
s = s.replace("""${campo('fForma','Forma de pagamento',false,sel('fForma',['Boleto bancário','PIX','Cartão de crédito','Transferência (TED)','Débito automático']))}""",
"""${campo('fForma','Forma de pagamento',false,sel('fForma',FORMAS_CAD.map(f=>({v:f.FORMA_ID,t:f.NOME||f.FORMA_ID}))))}""")

# a lista de pendências de aprovação é de quem tem alçada; "minhas" é de quem lançou
s = s.replace("function vMinhas(){\n  const me=USERS[ROLE][0];", "function vMinhas(){\n  const me=EU.nome;")

# ---------------------------------------------------------------- 5. ponte, login e abertura
ponte = open('ponte.js').read()
i = s.index("function fitMob(){")
s = s[:i] + ponte + '\n' + s[i:]
s = s.replace("renderMenu();render();\n</script>", "abrirApp();\n</script>")

# título da aba
s = s.replace('<title>FC Salomé', '<title>FC Salomé')

open('app.html','w').write(s)
print('app.html gerado — %.0f KB' % (len(s)/1024))

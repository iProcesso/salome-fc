/**
 * Vista.gs — o adaptador entre a planilha e a tela.
 *
 * Por que existe: no Apps Script o gargalo é a LATÊNCIA, não o volume. Cada
 * google.script.run custa entre 300 ms e 1,5 s. Dez chamadas para montar uma tela
 * são dez segundos de espera. Então a tela pede tudo de uma vez, e aqui a gente
 * devolve os dados JÁ NO FORMATO que ela desenha — nada de o navegador ficar
 * traduzindo nomes de coluna.
 *
 * O outro motivo é segurança: a tela nunca recebe campo que o perfil não pode ver.
 * Filtrar no cliente é filtrar depois de já ter entregue.
 */
const Vista = (function () {

  const TZ = 'America/Sao_Paulo';
  const dm  = function (d) { return d ? Utilities.formatDate(new Date(d), TZ, 'dd/MM') : ''; };
  const iso = function (d) { return d ? Utilities.formatDate(new Date(d), TZ, 'yyyy-MM-dd') : ''; };

  /* ====================================================================== */

  /** Tudo que a interface precisa para abrir. Uma chamada só. */
  function abrir(d, ses) {
    const cad = cadastros();
    return {
      usuario: {
        // Os nomes vêm de Auth.publico(): id, nome, email, perfilId, escopoFilial.
        id: ses.id, nome: ses.nome, email: ses.email,
        perfil: ses.perfilId, perfilNome: ses.perfilNome,
        iniciais: iniciais(ses.nome),
        filiais: ses.escopoFilial || 'TODAS'
      },
      permissoes: Perm.resumo(ses),
      versao: Cfg.param('VERSAO_APP', '1.0.0'),
      hoje: iso(new Date()),
      parametros: {
        saldoMinimo: Number(Cfg.param('SALDO_MINIMO_SEGURANCA', 0)),
        horizonte: Number(Cfg.param('HORIZONTE_SEMANAS', 12))
      },
      cadastros: cad,
      solicitacoes: solicitacoes(ses, cad),
      fluxo: fluxo(ses),
      alcadas: cad.alcadas.map(function (a) {
        return [Number(a.LIMITE_ATE), a.NOME, a.PERFIL_APROVADOR];
      }).sort(function (a, b) { return a[0] - b[0]; })
    };
  }

  function iniciais(nome) {
    const p = String(nome || '').trim().split(/\s+/);
    return ((p[0] || '')[0] || '' ).toUpperCase() + ((p[p.length - 1] || '')[0] || '').toUpperCase();
  }

  function cadastros() {
    return {
      filiais:      Repo.listar('FILIAIS'),
      areas:        Repo.listar('AREAS'),
      centros:      Repo.listar('CENTROS_CUSTO'),
      categorias:   Catalogo.listar(),
      blocos:       Catalogo.BLOCOS,
      contas:       Repo.listar('PLANO_CONTAS'),
      fornecedores: Repo.listar('FORNECEDORES'),
      condicoes:    Repo.listar('CONDICOES_PGTO'),
      formas:       Repo.listar('FORMAS_PGTO'),
      alcadas:      Repo.listar('ALCADAS'),
      usuarios:     Repo.listar('USUARIOS')
    };
  }

  /* ====================================================================== */

  const ROTULO_STATUS = {
    RASCUNHO: 'Rascunho', EM_VALIDACAO: 'Em validação', AGUARDANDO_CAIXA: 'Aguardando caixa',
    AGUARDANDO_APROVACAO: 'Aguardando Aprovação', REPROGRAMADO: 'Reprogramado',
    APROVADO: 'Aprovado', COMPROMETIDO: 'Comprometido', PAGO: 'Pago',
    REPROVADO: 'Reprovado', CANCELADO: 'Cancelado'
  };

  /** Solicitações no formato que os cards e as tabelas desenham. */
  function solicitacoes(ses, cad) {
    const usr  = indice(cad.usuarios, 'USUARIO_ID');
    const forn = indice(cad.fornecedores, 'FORNECEDOR_ID');
    const cats = indice(cad.categorias, 'CATEGORIA_ID');
    const cont = indice(cad.contas, 'CODIGO');
    const semanas = Cash.fluxo({}, ses);

    return Sol.listar({}, ses).map(function (s) {
      const f = forn[s.FORNECEDOR_ID] || {};
      const c = cats[s.CATEGORIA_ID] || {};
      const k = cont[s.CONTA_CODIGO] || {};
      const pre = Fluxo.prerequisitos(s, ses);
      const sem = semanaDe(semanas, s.DATA_PREVISTA_PGTO);

      return {
        id: s.SOLICITACAO_ID,
        dt: dm(s.DATA_SOLICITACAO),
        sol: (usr[s.SOLICITANTE_ID] || {}).NOME || s.SOLICITANTE_ID,
        solId: s.SOLICITANTE_ID,
        area: s.AREA_ID,
        fil: s.FILIAL_EMISSAO,
        centro: s.CENTRO_CUSTO,
        forn: f.RAZAO_SOCIAL || s.FORNECEDOR_ID,
        cod: s.CONTA_CODIGO,
        cls: k.DESCRICAO || c.NOME || '',
        categoria: s.CATEGORIA_ID,
        bloco: c.BLOCO || '',
        desc: s.DESCRICAO,
        val: Number(s.VALOR_BRUTO || 0),
        cond: s.CONDICAO_ID,
        forma: s.FORMA_ID,
        prev: dm(s.DATA_PREVISTA_PGTO),
        prevIso: iso(s.DATA_PREVISTA_PGTO),
        ant: s.REGRA_ANTECEDENCIA === 'OK' ? 'OK' : 'FORA DO PRAZO',
        alc: s.ALCADA_ID,
        st: ROTULO_STATUS[s.STATUS] || s.STATUS,
        status: s.STATUS,
        etapa: Fluxo.DE_STATUS[s.STATUS] || null,
        sem: sem ? sem.rotulo : '',
        saldo: sem ? sem.saldoAcumulado : 0,
        rec: s.RECOMENDACAO || '—',
        obs: s.OBSERVACAO || '',
        placa: s.PLACA || '',
        pre: pre,
        orc: estourouOrcamento(s)
      };
    });
  }

  function indice(lista, chave) {
    const m = {};
    (lista || []).forEach(function (r) { m[r[chave]] = r; });
    return m;
  }

  function semanaDe(f, data) {
    if (!data || !f || !f.semanas) return null;
    const d = new Date(data);
    for (let i = 0; i < f.semanas.length; i++) {
      if (d >= f.semanas[i].inicio && d <= f.semanas[i].fim) {
        return { rotulo: f.semanas[i].rotulo, saldoAcumulado: f.saldoAcumulado[i] };
      }
    }
    return null;
  }

  /** Sem orçamento carregado a resposta é NÃO — nunca um palpite. */
  function estourouOrcamento(s) {
    if (!s.CONTA_CODIGO || !s.DATA_PREVISTA_PGTO) return false;
    const mes = Utilities.formatDate(new Date(s.DATA_PREVISTA_PGTO), TZ, 'yyyy-MM');
    const o = Repo.listar('ORCAMENTO').filter(function (x) {
      return x.CONTA_CODIGO === s.CONTA_CODIGO && String(x.MES).indexOf(mes) === 0;
    })[0];
    if (!o) return false;
    return Number(o.REALIZADO || 0) + Number(s.VALOR_BRUTO || 0) > Number(o.ORCADO || 0);
  }

  /** O fluxo no formato dos gráficos: rótulos, datas, saldo acumulado e situação. */
  function fluxo(ses) {
    const f = Cash.fluxo({}, ses);
    return {
      semanas:  f.semanas.map(function (s) { return s.rotulo; }),
      datas:    f.semanas.map(function (s) { return dm(s.inicio); }),
      entradas: f.totalEntradas,
      saidas:   f.totalSaidas,
      previsto: f.tresNumeros.PREVISTO,
      comprometido: f.tresNumeros.COMPROMETIDO,
      realizado: f.tresNumeros.REALIZADO,
      saldoIni: f.saldoInicial,
      saldoAcu: f.saldoAcumulado,
      saldoMinimo: f.saldoMinimo,
      sit: f.situacao.map(function (x) { return x === 'ATENCAO' ? 'ATENÇÃO' : x; }),
      porConta: f.saidas
    };
  }

  /** Recarregar só o que muda, sem refazer o bootstrap inteiro. */
  function atualizar(d, ses) {
    const cad = cadastros();
    return { solicitacoes: solicitacoes(ses, cad), fluxo: fluxo(ses) };
  }

  return { abrir: abrir, atualizar: atualizar, solicitacoes: solicitacoes, fluxo: fluxo };
})();

/**
 * Perm.gs — motor de permissão. Três camadas, sempre resolvidas no servidor.
 * O cliente esconde botões por conveniência; quem decide é este arquivo.
 */
const Perm = (function () {

  function mapa(perfilId) {
    const linhas = Repo.listar('PERMISSOES', function (p) { return p.PERFIL_ID === perfilId; }, true);
    const m = {};
    linhas.forEach(function (p) { m[p.RECURSO] = p; });
    return m;
  }

  /** Lança se não puder. A mensagem nomeia perfil e ação — poupa muito suporte. */
  function exigir(ses, recurso, acao) {
    const p = mapa(ses.perfilId)[recurso];
    if (!p || String(p[acao]).toUpperCase() !== 'SIM') {
      throw new Error('SEM_PERMISSAO: seu perfil (' + ses.perfilNome + ') não pode '
                      + acao.toLowerCase() + ' em ' + recurso + '.');
    }
    return p;
  }

  function pode(ses, recurso, acao) {
    try { exigir(ses, recurso, acao); return true; } catch (e) { return false; }
  }

  /** Camada 2 — escopo de visibilidade. Aplique ANTES de devolver qualquer lista. */
  function filtrarEscopo(ses, recurso, registros, campoDono, campoFilial) {
    const p = mapa(ses.perfilId)[recurso];
    if (!p) return [];
    if (p.ESCOPO === 'TODAS') return registros;
    if (p.ESCOPO === 'PROPRIO') {
      return registros.filter(function (r) { return r[campoDono] === ses.id; });
    }
    const filiais = String(ses.escopoFilial || '').split(';').map(function (s) { return s.trim(); });
    return registros.filter(function (r) { return filiais.indexOf(r[campoFilial]) >= 0; });
  }

  /** Camada 2 — alçada. */
  function limite(ses) {
    if (ses.limiteAlcada) return Number(ses.limiteAlcada);
    const p = mapa(ses.perfilId)['SOLICITACAO'];
    return p ? Number(p.LIMITE_VALOR || 0) : 0;
  }

  function podeAprovar(ses, valor) {
    return pode(ses, 'SOLICITACAO', 'APROVAR') && Number(valor) <= limite(ses);
  }

  /**
   * Camada 3 — campo × status. Descarta silenciosamente o que o cliente mandou sem poder.
   * Regra mais específica vence: (campo exato, status exato) > (campo, *) > (*, status) > (*, *)
   */
  function filtrarCampos(ses, recurso, atual, entrada) {
    const status = (atual && atual.STATUS) || 'RASCUNHO';
    const regras = Repo.listar('PERMISSOES_CAMPO', function (r) {
      return r.PERFIL_ID === ses.perfilId && r.RECURSO === recurso;
    }, true);

    function permitido(campo) {
      let melhor = null, peso = -1;
      regras.forEach(function (r) {
        const cOk = (r.CAMPO === campo), cAny = (r.CAMPO === '*');
        const sOk = (r.STATUS_REGISTRO === status), sAny = (r.STATUS_REGISTRO === '*');
        if (!(cOk || cAny) || !(sOk || sAny)) return;
        const w = (cOk ? 2 : 0) + (sOk ? 1 : 0);
        if (w > peso) { peso = w; melhor = r; }
      });
      return melhor ? String(melhor.PODE_EDITAR).toUpperCase() === 'SIM' : false;
    }

    const saida = {};
    Object.keys(entrada).forEach(function (campo) {
      if (permitido(campo)) saida[campo] = entrada[campo];
    });
    return saida;
  }

  /** Devolve ao cliente o que ele precisa para montar menu e botões. */
  function resumo(ses) {
    const m = mapa(ses.perfilId);
    const out = { limite: limite(ses), recursos: {} };
    Object.keys(m).forEach(function (r) {
      out.recursos[r] = {
        ver: m[r].VER === 'SIM', incluir: m[r].INCLUIR === 'SIM', alterar: m[r].ALTERAR === 'SIM',
        inativar: m[r].INATIVAR === 'SIM', aprovar: m[r].APROVAR === 'SIM',
        exportar: m[r].EXPORTAR === 'SIM', importar: m[r].IMPORTAR === 'SIM', escopo: m[r].ESCOPO
      };
    });
    return out;
  }

  return {
    exigir: exigir, pode: pode, filtrarEscopo: filtrarEscopo, filtrarCampos: filtrarCampos,
    limite: limite, podeAprovar: podeAprovar, resumo: resumo, mapa: mapa
  };
})();

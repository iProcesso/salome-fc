/**
 * Perm.gs — motor de permissão. Três camadas, sempre resolvidas no servidor.
 * O cliente esconde botões por conveniência; quem decide é este arquivo.
 */
const Perm = (function () {

  /**
   * Uma pessoa pode ter mais de um perfil.
   *
   * Na Salomé isso é a regra, não a exceção: quem lança a compra da frota muitas vezes é
   * a mesma pessoa que confere o caixa. Obrigar duas contas para a mesma pessoa é o tipo
   * de burocracia que faz todo mundo compartilhar senha — e aí o log deixa de valer.
   *
   * O campo PERFIL_ID aceita vários, separados por ponto e vírgula: SOLICITANTE;FINANCEIRO.
   */
  function perfisDe(x) {
    return String((x && x.perfilId !== undefined ? x.perfilId : x) || '')
      .split(';')
      .map(function (p) { return p.trim().toUpperCase(); })
      .filter(String);
  }

  /** Escopo mais largo vence: quem enxerga tudo por um perfil não passa a enxergar menos por outro. */
  const PESO_ESCOPO = { PROPRIO: 1, FILIAL: 2, TODAS: 3 };

  /**
   * A permissão de quem tem vários perfis é a UNIÃO deles, não a interseção.
   *
   * O contrário seria absurdo: acumular o perfil de Financeiro tiraria da pessoa o direito
   * de abrir a própria solicitação, porque Financeiro sozinho não inclui. Perfil se soma.
   *
   * Cada bandeira é SIM se qualquer perfil disser SIM; o limite de alçada é o MAIOR; o
   * escopo é o mais largo. Quem quiser restringir alguém tira o perfil, não acumula.
   */
  function mapa(perfilId) {
    const perfis = perfisDe(perfilId);
    if (!perfis.length) return {};

    const linhas = Repo.listar('PERMISSOES', function (p) {
      return perfis.indexOf(String(p.PERFIL_ID).toUpperCase()) >= 0;
    }, true);

    const m = {};
    const BANDEIRAS = ['VER', 'INCLUIR', 'ALTERAR', 'INATIVAR', 'APROVAR', 'EXPORTAR', 'IMPORTAR'];

    linhas.forEach(function (p) {
      const r = p.RECURSO;
      if (!m[r]) { m[r] = Object.assign({}, p); return; }
      BANDEIRAS.forEach(function (b) {
        if (String(p[b]).toUpperCase() === 'SIM') m[r][b] = 'SIM';
      });
      if ((PESO_ESCOPO[p.ESCOPO] || 0) > (PESO_ESCOPO[m[r].ESCOPO] || 0)) m[r].ESCOPO = p.ESCOPO;
      m[r].LIMITE_VALOR = Math.max(Number(m[r].LIMITE_VALOR || 0), Number(p.LIMITE_VALOR || 0));
    });
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
    const perfis = perfisDe(ses);
    const regras = Repo.listar('PERMISSOES_CAMPO', function (r) {
      return perfis.indexOf(String(r.PERFIL_ID).toUpperCase()) >= 0 && r.RECURSO === recurso;
    }, true);

    /**
     * Dentro de um perfil, a regra mais específica vence. ENTRE perfis, basta um permitir.
     *
     * A ordem importa: resolver a especificidade primeiro e só depois somar os perfis é o
     * que impede um "*" genérico de um perfil apagar um "NAO" específico de outro.
     */
    function permitido(campo) {
      return perfis.some(function (perfil) {
        let melhor = null, peso = -1;
        regras.forEach(function (r) {
          if (String(r.PERFIL_ID).toUpperCase() !== perfil) return;
          const cOk = (r.CAMPO === campo), cAny = (r.CAMPO === '*');
          const sOk = (r.STATUS_REGISTRO === status), sAny = (r.STATUS_REGISTRO === '*');
          if (!(cOk || cAny) || !(sOk || sAny)) return;
          const w = (cOk ? 2 : 0) + (sOk ? 1 : 0);
          if (w > peso) { peso = w; melhor = r; }
        });
        return melhor ? String(melhor.PODE_EDITAR).toUpperCase() === 'SIM' : false;
      });
    }

    const saida = {};
    Object.keys(entrada).forEach(function (campo) {
      if (permitido(campo)) saida[campo] = entrada[campo];
    });
    return saida;
  }

  /** Devolve ao cliente o que ele precisa para montar menu e botões. */
  /**
   * Exige a visão da empresa inteira em um recurso (escopo TODAS). Usada nas telas que
   * mostram dado de todas as solicitações — como o Fluxo de caixa. O menu esconder a tela
   * não basta: a função do servidor precisa recusar quem chamar direto.
   */
  function exigirTodas(ses, recurso) {
    const p = mapa(ses.perfilId)[recurso];
    if (!p || p.ESCOPO !== 'TODAS') {
      throw new Error('SEM_PERMISSAO: esta visão é só para perfis que enxergam a empresa inteira.');
    }
    return p;
  }

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
    exigir: exigir, exigirTodas: exigirTodas, pode: pode, filtrarEscopo: filtrarEscopo, filtrarCampos: filtrarCampos,
    limite: limite, podeAprovar: podeAprovar, resumo: resumo, mapa: mapa, perfisDe: perfisDe
  };
})();

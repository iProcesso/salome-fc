/**
 * Fluxo.gs — o quadro Kanban do lado do servidor.
 *
 * Seis colunas que seguram card DE VERDADE. "Validar" e "Consultar caixa" não são
 * passos instantâneos do sistema — são espera real: a primeira segura o que está
 * incompleto, a segunda o que depende da reunião de caixa. Coluna que nunca segura
 * card é decoração, e decoração não entra aqui.
 *
 * Reprovado, cancelado e pago SAEM do quadro. Card morto ocupando coluna vira ruído.
 *
 * IMPORTANTE: a tela também tem esta regra, em JavaScript, para dar resposta imediata
 * ao arrastar. Aquilo é conforto. A regra que VALE é esta, no servidor — o cliente pode
 * ser adulterado, o servidor não.
 */
const Fluxo = (function () {

  /** Ordem importa: é ela que impede pular etapa. */
  const ETAPAS = ['SOLICITAR', 'VALIDAR', 'CAIXA', 'APROVAR', 'AUTORIZAR', 'RECEBER'];

  const ROTULO = {
    SOLICITAR: 'Solicitar', VALIDAR: 'Validar', CAIXA: 'Consultar caixa',
    APROVAR: 'Aprovar', AUTORIZAR: 'Autorizar', RECEBER: 'Receber'
  };

  /** Etapa do quadro ⇄ STATUS gravado na planilha. */
  const PARA_STATUS = {
    SOLICITAR: 'RASCUNHO', VALIDAR: 'EM_VALIDACAO', CAIXA: 'AGUARDANDO_CAIXA',
    APROVAR: 'AGUARDANDO_APROVACAO', AUTORIZAR: 'APROVADO', RECEBER: 'COMPROMETIDO'
  };
  const DE_STATUS = {
    RASCUNHO: 'SOLICITAR', EM_VALIDACAO: 'VALIDAR', AGUARDANDO_CAIXA: 'CAIXA',
    AGUARDANDO_APROVACAO: 'APROVAR', REPROGRAMADO: 'CAIXA',
    APROVADO: 'AUTORIZAR', COMPROMETIDO: 'RECEBER'
  };

  /** Pré-requisito de entrada em cada coluna. */
  const GATES = {
    VALIDAR:   [],
    CAIXA:     ['anexo', 'rateio', 'placa'],
    APROVAR:   ['caixa'],
    AUTORIZAR: ['alcada'],
    RECEBER:   ['pedido']
  };

  const EXPLICA = {
    anexo:  'o orçamento anexado',
    rateio: 'o rateio fechando 100%',
    placa:  'a placa do veículo',
    caixa:  'caixa na semana — hoje a recomendação é reprogramar',
    alcada: 'alçada suficiente para o valor',
    pedido: 'o número do pedido ao fornecedor'
  };

  /** Quem move para onde. É a mesma matriz de permissão do resto do app. */
  const MOVE_PERFIL = {
    SOLICITANTE: ['VALIDAR', 'CAIXA'],
    FINANCEIRO:  ['VALIDAR', 'CAIXA', 'APROVAR', 'AUTORIZAR', 'RECEBER'],
    DIRETORIA:   ['VALIDAR', 'CAIXA', 'APROVAR', 'AUTORIZAR', 'RECEBER'],
    ADMIN:       []
  };

  /* ====================================================================== */

  /** O quadro inteiro em um round-trip. Latência é o gargalo do Apps Script, não volume. */
  function quadro(d, ses) {
    const sols = Sol.listar({}, ses);
    const colunas = {};
    ETAPAS.forEach(function (e) { colunas[e] = { etapa: e, rotulo: ROTULO[e], cards: [], valor: 0 }; });
    const fora = [];

    sols.forEach(function (s) {
      const etapa = DE_STATUS[s.STATUS];
      const card = montarCard(s, ses);
      if (!etapa) { fora.push(card); return; }
      colunas[etapa].cards.push(card);
      colunas[etapa].valor += Number(s.VALOR_BRUTO || 0);
    });

    return {
      etapas: ETAPAS.map(function (e) { return colunas[e]; }),
      fora: fora,
      totais: {
        noQuadro: ETAPAS.reduce(function (a, e) { return a + colunas[e].cards.length; }, 0),
        valor:    ETAPAS.reduce(function (a, e) { return a + colunas[e].valor; }, 0)
      }
    };
  }

  function montarCard(s, ses) {
    const pre = prerequisitos(s, ses);
    return {
      id: s.SOLICITACAO_ID, fornecedor: s.FORNECEDOR_ID, descricao: s.DESCRICAO,
      valor: Number(s.VALOR_BRUTO || 0), previsto: s.DATA_PREVISTA_PGTO,
      filial: s.FILIAL_EMISSAO, centro: s.CENTRO_CUSTO, categoria: s.CATEGORIA_ID,
      area: s.AREA_ID, placa: s.PLACA, alcada: s.ALCADA_ID, recomendacao: s.RECOMENDACAO,
      status: s.STATUS, etapa: DE_STATUS[s.STATUS] || null,
      pre: pre, faltam: Object.keys(pre).filter(function (k) { return !pre[k]; })
    };
  }

  /**
   * O que já está de pé nesta solicitação. Cada um é um fato verificável, nunca um palpite:
   * anexo existe no Drive, rateio soma 100, placa está preenchida, a semana tem saldo.
   */
  function prerequisitos(s, ses) {
    const cat = s.CATEGORIA_ID ? Repo.achar('CATEGORIAS', 'CATEGORIA_ID', s.CATEGORIA_ID) : null;
    const exigeAnexo = cat && cat.EXIGE_ANEXO === 'SIM';
    const exigePlaca = cat && cat.EXIGE_PLACA === 'SIM';

    const anexos = Repo.listar('ANEXOS', function (a) { return a.REGISTRO_ID === s.SOLICITACAO_ID; });
    const rateio = Repo.listar('RATEIO', function (r) { return r.SOLICITACAO_ID === s.SOLICITACAO_ID; });
    const soma = rateio.reduce(function (a, r) { return a + Number(r.PERCENTUAL || 0); }, 0);

    return {
      anexo:  exigeAnexo ? anexos.length > 0 : true,
      rateio: (s.TEM_RATEIO === 'SIM') ? Math.abs(soma - 100) < 0.001 : true,
      placa:  exigePlaca ? !!String(s.PLACA || '').trim() : true,
      caixa:  s.RECOMENDACAO !== 'REPROGRAMAR',
      alcada: Perm.podeAprovar(ses, Number(s.VALOR_BRUTO || 0)),
      pedido: !!String(s.CHAVE_AUTORIZACAO || '').trim()
    };
  }

  /**
   * Mover um card. Três camadas, nesta ordem — a mesma ordem da tela:
   *   1. é um movimento possível no fluxo?
   *   2. este perfil move para lá?
   *   3. os pré-requisitos da coluna de destino estão de pé?
   * Nada muda de estado sem passar pelas três, e o movimento vai inteiro para o log.
   */
  function mover(d, ses) {
    const s = Repo.achar('SOLICITACOES', 'SOLICITACAO_ID', d.id);
    if (!s) throw new Error('NAO_ENCONTRADO: solicitação ' + d.id + '.');

    const de = DE_STATUS[s.STATUS];
    const alvo = d.etapa;
    if (!de) throw new Error('FORA_DO_QUADRO: ' + d.id + ' está como ' + s.STATUS + ' e não anda mais no fluxo.');
    if (ETAPAS.indexOf(alvo) < 0) throw new Error('ETAPA_DESCONHECIDA: ' + alvo + '.');
    if (de === alvo) return { id: d.id, etapa: alvo, semMudanca: true };

    const iDe = ETAPAS.indexOf(de), iPara = ETAPAS.indexOf(alvo);

    if (iPara > iDe + 1) {
      throw new Error('PULO_DE_ETAPA: de "' + ROTULO[de] + '" o próximo passo é "' +
                      ROTULO[ETAPAS[iDe + 1]] + '".');
    }

    const podeMover = MOVE_PERFIL[ses.perfilId] || [];
    if (iPara > iDe && podeMover.indexOf(alvo) < 0) {
      throw new Error('SEM_PERMISSAO: o perfil ' + (ses.perfilNome || ses.perfilId) + ' não move card para "' + ROTULO[alvo] + '".');
    }
    if (iPara < iDe && ses.perfilId === 'SOLICITANTE') {
      throw new Error('SEM_PERMISSAO: só Financeiro e Diretoria devolvem card para uma etapa anterior.');
    }

    // O número do pedido é o único pré-requisito que se resolve no próprio movimento.
    if (alvo === 'RECEBER' && d.pedido) s.CHAVE_AUTORIZACAO = String(d.pedido).trim();

    if (iPara > iDe) {
      const pre = prerequisitos(s, ses);
      const faltam = (GATES[alvo] || []).filter(function (g) { return !pre[g]; });
      if (faltam.length) {
        throw new Error('PRE_REQUISITO: para entrar em "' + ROTULO[alvo] + '" falta ' +
          faltam.map(function (g) { return EXPLICA[g]; }).join(' e ') + '.');
      }
    }

    const antes = s.STATUS;
    s.STATUS = PARA_STATUS[alvo];
    if (alvo === 'AUTORIZAR' && !s.DATA_APROVACAO) {
      s.DATA_APROVACAO = new Date();
      s.APROVADOR_ID = ses.id;
    }
    const r = Repo.salvar('SOLICITACOES', s, ses);

    Log.ativ(ses, 'SOLICITACAO', 'MOVER', d.id,
      [{ campo: 'STATUS', antes: antes, depois: s.STATUS, motivo: d.motivo || 'movido no quadro' }]);

    return {
      id: d.id, de: de, etapa: alvo, status: s.STATUS, versao: r.registro.VERSAO,
      mensagem: d.id.slice(-5) + ' · ' + ROTULO[de] + ' → ' + ROTULO[alvo] +
                '. Status atualizado, ' + ses.nome + ' registrado no log.'
    };
  }

  /** O que a tela precisa saber ANTES de aceitar o arrasto — sem gravar nada. */
  function simularMovimento(d, ses) {
    try {
      const s = Repo.achar('SOLICITACOES', 'SOLICITACAO_ID', d.id);
      const de = DE_STATUS[s.STATUS];
      const iDe = ETAPAS.indexOf(de), iPara = ETAPAS.indexOf(d.etapa);
      if (iPara > iDe) {
        const pre = prerequisitos(s, ses);
        const faltam = (GATES[d.etapa] || []).filter(function (g) { return !pre[g]; });
        if (faltam.length === 1 && faltam[0] === 'pedido') {
          return { ok: true, pergunta: 'pedido' };
        }
        if (faltam.length) {
          return { ok: false, motivo: 'Falta ' + faltam.map(function (g) { return EXPLICA[g]; }).join(' e ') + '.' };
        }
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, motivo: String(e.message || e) };
    }
  }

  return {
    ETAPAS: ETAPAS, ROTULO: ROTULO, PARA_STATUS: PARA_STATUS, DE_STATUS: DE_STATUS,
    quadro: quadro, mover: mover, simularMovimento: simularMovimento,
    prerequisitos: prerequisitos
  };
})();

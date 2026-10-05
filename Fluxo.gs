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
    RECEBER:   ['capa', 'pedido']
  };

  /**
   * "Autorizar" é trabalho, não carimbo.
   *
   * Aprovar é dizer "pode comprar". Autorizar é emitir a capa, mandar ao fornecedor e
   * anotar o número que ele devolve. São dois atos, duas pessoas possíveis, dois momentos
   * — e dois identificadores que nada têm a ver um com o outro:
   *
   *   CHAVE_AUTORIZACAO   nossa. Nasce aqui, vai na capa, é o que o fornecedor recebe.
   *   PEDIDO_FORNECEDOR   dele. Volta para nós e é o que amarra a nota fiscal depois.
   *
   * Até a v1.1 os dois dividiam o mesmo campo, e o número do fornecedor gravava por cima
   * da nossa chave. Um campo, dois donos: o segundo apagava o primeiro, e junto ia embora
   * a prova de qual autorização gerou aquela compra.
   */

  const EXPLICA = {
    anexo:  'o orçamento anexado',
    rateio: 'o rateio fechando 100%',
    placa:  'a placa do veículo',
    caixa:  'caixa na semana — hoje a recomendação é reprogramar',
    alcada: 'alçada suficiente para o valor',
    pedido: 'o número do pedido que o fornecedor devolveu',
    capa:   'a capa de autorização emitida ao fornecedor'
  };

  /** Quem move para onde. É a mesma matriz de permissão do resto do app. */
  const MOVE_PERFIL = {
    SOLICITANTE: ['VALIDAR', 'CAIXA'],
    FINANCEIRO:  ['VALIDAR', 'CAIXA', 'APROVAR', 'AUTORIZAR', 'RECEBER'],
    DIRETORIA:   ['VALIDAR', 'CAIXA', 'APROVAR', 'AUTORIZAR', 'RECEBER'],
    ADMIN:       []
  };

  /**
   * Emitir a capa ao fornecedor é trabalho de quem fala com ele — e quem fala com o
   * fornecedor costuma ser quem pediu a compra, não quem liberou o dinheiro.
   *
   * Isso não afrouxa nada: o solicitante só chega aqui depois de a compra estar APROVADA,
   * e aprovar continua sendo de quem tem alçada. Mandar a capa de algo já aprovado é
   * execução, não decisão.
   */
  const AUTORIZA_PERFIL = ['SOLICITANTE', 'FINANCEIRO', 'DIRETORIA'];

  /** A união do que os perfis da pessoa permitem — perfil se soma, nunca se subtrai. */
  function movimentosDe(ses) {
    const out = [];
    Perm.perfisDe(ses).forEach(function (p) {
      (MOVE_PERFIL[p] || []).forEach(function (e) { if (out.indexOf(e) < 0) out.push(e); });
    });
    return out;
  }


  /* ====================================================================== */
  /*  AUTORIZAR — a capa que vai ao fornecedor                              */
  /* ====================================================================== */

  /** A fila da autorização: aprovado e ainda não foi ao fornecedor. */
  function pendentesDeAutorizacao(d, ses) {
    const forn = {};
    Repo.listar('FORNECEDORES', null, true).forEach(function (f) { forn[f.FORNECEDOR_ID] = f; });

    return Sol.listar({}, ses)
      .filter(function (s) { return s.STATUS === 'APROVADO'; })
      .map(function (s) {
        const f = forn[s.FORNECEDOR_ID] || {};
        return {
          id: s.SOLICITACAO_ID,
          fornecedor: f.RAZAO_SOCIAL || s.FORNECEDOR_ID,
          fornecedorId: s.FORNECEDOR_ID,
          email: f.EMAIL || '',
          descricao: s.DESCRICAO,
          valor: Number(s.VALOR_BRUTO || 0),
          previsto: s.DATA_PREVISTA_PGTO,
          condicao: s.CONDICAO_ID,
          filial: s.FILIAL_EMISSAO,
          chave: s.CHAVE_AUTORIZACAO || '',
          pedido: s.PEDIDO_FORNECEDOR || '',
          autorizadaEm: s.DATA_AUTORIZACAO || ''
        };
      });
  }

  /**
   * Emite a autorização. Gera a chave, carimba quem e quando, e devolve o texto da capa.
   *
   * A chave é gerada UMA vez. Autorizar de novo devolve a mesma — reemitir a capa é
   * comum (o e-mail se perdeu, o contato mudou), gerar chave nova não: seria dizer ao
   * fornecedor que a autorização anterior não valia.
   */
  function autorizar(d, ses) {
    const s = Repo.achar('SOLICITACOES', 'SOLICITACAO_ID', d.id);
    if (!s) throw new Error('NAO_ENCONTRADO: solicitação ' + d.id + '.');
    if (s.STATUS !== 'APROVADO') {
      throw new Error('ESTADO_INVALIDO: só se autoriza o que foi aprovado. ' +
                      d.id + ' está como ' + s.STATUS + '.');
    }
    const podeAutorizar = Perm.perfisDe(ses).some(function (p) { return AUTORIZA_PERFIL.indexOf(p) >= 0; });
    if (!podeAutorizar) {
      throw new Error('SEM_PERMISSAO: o perfil ' + (ses.perfilNome || ses.perfilId) +
                      ' não emite autorização ao fornecedor.');
    }

    const nova = !String(s.CHAVE_AUTORIZACAO || '').trim();
    if (nova) {
      s.CHAVE_AUTORIZACAO = 'AUT-' + new Date().getFullYear() + '-' +
                            Utilities.getUuid().substring(0, 6).toUpperCase();
      s.DATA_AUTORIZACAO = new Date();
      s.AUTORIZADO_POR = ses.id;
      Repo.salvar('SOLICITACOES', s, ses, { forcar: true });
      Log.ativ(ses, 'SOLICITACAO', 'AUTORIZAR', d.id,
        [{ campo: 'CHAVE_AUTORIZACAO', antes: '', depois: s.CHAVE_AUTORIZACAO,
           motivo: 'capa emitida ao fornecedor' }]);
    }

    return {
      id: d.id, chave: s.CHAVE_AUTORIZACAO, reemissao: !nova,
      capa: textoDaCapa(s),
      mensagem: nova ? 'Autorização ' + s.CHAVE_AUTORIZACAO + ' emitida.'
                     : 'Capa reemitida com a mesma chave ' + s.CHAVE_AUTORIZACAO + '.'
    };
  }

  /**
   * O texto da capa, pronto para colar no e-mail.
   *
   * Enquanto o PDF não existe (Files.gs), o processo não pode parar esperando o documento
   * bonito. Texto que se copia hoje vale mais que anexo que chega mês que vem.
   */
  function textoDaCapa(s) {
    const f = Repo.achar('FORNECEDORES', 'FORNECEDOR_ID', s.FORNECEDOR_ID) || {};
    const fil = Repo.achar('FILIAIS', 'FILIAL_ID', s.FILIAL_EMISSAO) || {};
    const d = function (x) {
      return x ? Utilities.formatDate(new Date(x), 'America/Sao_Paulo', 'dd/MM/yyyy') : '—';
    };
    const brl = function (v) {
      return 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    };
    return [
      'AUTORIZAÇÃO DE COMPRA ' + s.CHAVE_AUTORIZACAO,
      'Expresso Salomé — ' + (fil.NOME || s.FILIAL_EMISSAO),
      '',
      'Fornecedor: ' + (f.RAZAO_SOCIAL || s.FORNECEDOR_ID),
      'Item: ' + (s.DESCRICAO || '—'),
      'Valor autorizado: ' + brl(s.VALOR_BRUTO),
      'Condição de pagamento: ' + (s.CONDICAO_ID || '—'),
      'Previsão de pagamento: ' + d(s.DATA_PREVISTA_PGTO),
      '',
      'Esta autorização é a condição para faturar. A nota fiscal deve citar o número',
      s.CHAVE_AUTORIZACAO + ' e o valor não pode exceder o autorizado acima.',
      '',
      'Responda este e-mail com o número do seu pedido.'
    ].join('\n');
  }

  /** O número que o fornecedor devolveu. É ele que amarra a nota fiscal. */
  function registrarPedido(d, ses) {
    const s = Repo.achar('SOLICITACOES', 'SOLICITACAO_ID', d.id);
    if (!s) throw new Error('NAO_ENCONTRADO: solicitação ' + d.id + '.');
    if (!String(s.CHAVE_AUTORIZACAO || '').trim()) {
      throw new Error('SEM_AUTORIZACAO: emita a capa antes de registrar o pedido do fornecedor.');
    }
    const num = String(d.pedido || '').trim();
    if (!num) throw new Error('PEDIDO_OBRIGATORIO: informe o número que o fornecedor devolveu.');

    const antes = s.PEDIDO_FORNECEDOR || '';
    s.PEDIDO_FORNECEDOR = num;
    const r = Repo.salvar('SOLICITACOES', s, ses, { forcar: true });
    Log.ativ(ses, 'SOLICITACAO', 'PEDIDO', d.id,
      [{ campo: 'PEDIDO_FORNECEDOR', antes: antes, depois: num, motivo: 'informado pelo fornecedor' }]);

    return { id: d.id, pedido: num, versao: r.registro.VERSAO,
             mensagem: 'Pedido ' + num + ' registrado. A nota fiscal já pode ser recebida.' };
  }

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
      pedido: !!String(s.PEDIDO_FORNECEDOR || '').trim(),
      capa:   !!String(s.CHAVE_AUTORIZACAO || '').trim()
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

    const podeMover = movimentosDe(ses);
    if (iPara > iDe && podeMover.indexOf(alvo) < 0) {
      throw new Error('SEM_PERMISSAO: o perfil ' + (ses.perfilNome || ses.perfilId) + ' não move card para "' + ROTULO[alvo] + '".');
    }
    if (iPara < iDe && podeMover.indexOf('APROVAR') < 0) {
      throw new Error('SEM_PERMISSAO: só Financeiro e Diretoria devolvem card para uma etapa anterior.');
    }

    // O número do pedido é o único pré-requisito que se resolve no próprio movimento —
    // e vai para o campo DELE, nunca por cima da nossa chave de autorização.
    if (alvo === 'RECEBER' && d.pedido) s.PEDIDO_FORNECEDOR = String(d.pedido).trim();

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
    movimentosDe: movimentosDe, AUTORIZA_PERFIL: AUTORIZA_PERFIL,
    quadro: quadro, mover: mover, simularMovimento: simularMovimento,
    prerequisitos: prerequisitos,
    pendentesDeAutorizacao: pendentesDeAutorizacao, autorizar: autorizar,
    registrarPedido: registrarPedido, textoDaCapa: textoDaCapa
  };
})();

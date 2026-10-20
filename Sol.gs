/**
 * Sol.gs — o ciclo da solicitação: listar, obter, salvar e decidir.
 * O escopo do perfil é aplicado ANTES de devolver qualquer lista.
 */
const Sol = (function () {

  function listar(d, ses) {
    let lista = Repo.listar('SOLICITACOES', null, true);
    if (d && d.status) lista = lista.filter(function (s) { return d.status.indexOf(s.STATUS) >= 0; });
    lista = Perm.filtrarEscopo(ses, 'SOLICITACAO', lista, 'SOLICITANTE_ID', 'FILIAL_EMISSAO');
    return lista.sort(function (a, b) {
      return new Date(a.DATA_PREVISTA_PGTO) - new Date(b.DATA_PREVISTA_PGTO);
    });
  }

  function obter(id, ses) {
    const s = Repo.achar('SOLICITACOES', 'SOLICITACAO_ID', id);
    if (!s) throw new Error('Solicitação ' + id + ' não encontrada.');
    const visiveis = Perm.filtrarEscopo(ses, 'SOLICITACAO', [s], 'SOLICITANTE_ID', 'FILIAL_EMISSAO');
    if (!visiveis.length) throw new Error('SEM_PERMISSAO: esta solicitação está fora do seu escopo.');
    return {
      solicitacao: s,
      rateio: Repo.listar('RATEIO', function (r) { return r.SOLICITACAO_ID === id; }, true),
      aprovacoes: Repo.listar('APROVACOES', function (a) { return a.SOLICITACAO_ID === id; }, true),
      anexos: Repo.listar('ANEXOS', function (a) { return a.REGISTRO_ID === id; }, true),
      historico: Log.historico(id)
    };
  }

  /**
   * Aceita o payload da tela (categoria, fornecedor, filial…) e monta a linha.
   * A tela nunca manda CONTA_CODIGO nem alçada: esses são deduzidos aqui, onde a
   * regra mora. Mandar do cliente seria confiar no cliente.
   */
  /** Categoria de frete contratado (Catalogo.gs). Só ela exige transferência ou distribuição. */
  const CATEGORIA_FRETE = 'CA-FRE';

  function montarRegistro(d, ses) {
    const reg = d.registro || (d.id ? Repo.achar('SOLICITACOES', 'SOLICITACAO_ID', d.id) : {}) || {};
    const campo = function (chave, valor) { if (valor !== undefined && valor !== null) reg[chave] = valor; };

    campo('CATEGORIA_ID',      d.categoriaId);
    campo('FORNECEDOR_ID',     d.fornecedorId);
    campo('AREA_ID',           d.areaId);
    campo('FILIAL_EMISSAO',    d.filialEmissao);
    campo('CENTRO_CUSTO',      d.centroCusto);
    campo('PLACA',             d.placa);
    campo('DESCRICAO',         d.descricao);
    campo('VALOR_BRUTO',       d.valorBruto);
    campo('CONDICAO_ID',       d.condicaoId);
    campo('FORMA_ID',          d.formaId);
    campo('JUSTIFICATIVA_PRAZO', d.justificativa);
    campo('EMERGENCIAL',       d.emergencial ? 'SIM' : undefined);
    campo('TIPO_FRETE',        d.tipoFrete);
    campo('ROTA_ID',           d.rotaId);
    campo('UNIDADE_COMPRA_ID', d.unidadeCompra);
    if (d.dataPrevista) reg.DATA_PREVISTA_PGTO = new Date(d.dataPrevista + 'T12:00:00');
    if (d.versao !== undefined) reg.VERSAO = d.versao;
    return reg;
  }

  function salvar(d, ses) {
    const reg = montarRegistro(d, ses);

    if (!reg.CATEGORIA_ID) throw new Error('CATEGORIA_OBRIGATORIA: escolha o que vai ser comprado.');
    if (!reg.FORNECEDOR_ID) throw new Error('FORNECEDOR_OBRIGATORIO: escolha de quem é a compra.');
    if (!Number(reg.VALOR_BRUTO)) throw new Error('VALOR_OBRIGATORIO: informe o valor bruto estimado.');

    // Frete contratado: transferência (uma rota, um pagamento, custo na rota) ou distribuição (rateio).
    if (reg.CATEGORIA_ID === CATEGORIA_FRETE) {
      if (['TRANSFERENCIA', 'DISTRIBUICAO'].indexOf(reg.TIPO_FRETE) < 0) {
        throw new Error('TIPO_FRETE_OBRIGATORIO: no frete contratado diga se é transferência entre unidades ou distribuição.');
      }
      if (reg.TIPO_FRETE === 'TRANSFERENCIA') {
        if (!reg.ROTA_ID) throw new Error('ROTA_OBRIGATORIA: escolha a rota (origem e destino) da transferência.');
        const rota = Repo.achar('ROTAS', 'ROTA_ID', reg.ROTA_ID);
        if (!rota || rota.STATUS === 'INATIVO') throw new Error('ROTA_INVALIDA: a rota escolhida não existe ou está inativa.');
      } else {
        reg.ROTA_ID = '';
      }
    } else {
      reg.TIPO_FRETE = '';
      reg.ROTA_ID = '';
    }

    // Compra para outra unidade: só quando o parâmetro estiver ligado. Senão, é da própria filial.
    if (Cfg.param('PERMITE_COMPRA_OUTRA_UNIDADE', 'NAO') === 'SIM') {
      if (!reg.UNIDADE_COMPRA_ID) throw new Error('UNIDADE_OBRIGATORIA: para qual unidade é esta compra?');
    } else {
      reg.UNIDADE_COMPRA_ID = reg.FILIAL_EMISSAO;
    }

    const sim = Rules.simular({
      categoriaId: reg.CATEGORIA_ID, fornecedorId: reg.FORNECEDOR_ID,
      centroCusto: reg.CENTRO_CUSTO, condicaoId: reg.CONDICAO_ID, valorBruto: reg.VALOR_BRUTO,
      dataPrevista: reg.DATA_PREVISTA_PGTO, dataSolicitacao: reg.DATA_SOLICITACAO,
      emergencial: reg.EMERGENCIAL === 'SIM'
    }, ses);

    // A classificação contábil sai da categoria + do tipo do fornecedor, aqui no servidor.
    reg.CONTA_CODIGO = sim.contaCodigo;
    if (sim.exigePlaca && !String(reg.PLACA || '').trim()) {
      throw new Error('PLACA_OBRIGATORIA: "' + sim.categoriaNome +
        '" é gasto de frota. Sem placa não há como apurar custo por veículo.');
    }
    if (!reg.DATA_PREVISTA_PGTO) reg.DATA_PREVISTA_PGTO = sim.dataSugerida;
    if (!reg.CONDICAO_ID) reg.CONDICAO_ID = sim.condicaoSugerida;
    if (!reg.CENTRO_CUSTO) reg.CENTRO_CUSTO = sim.centroSugerido;
    reg.RETENCAO_REGRA     = sim.retencao ? sim.retencao.regra : '';
    reg.RETENCAO_ESTIMADA  = sim.valorRetido || 0;
    reg.VALOR_LIQUIDO      = sim.valorLiquido || reg.VALOR_BRUTO;

    if (sim.regraAntecedencia === 'FORA_DO_PRAZO' && !reg.JUSTIFICATIVA_PRAZO && reg.EMERGENCIAL !== 'SIM') {
      throw new Error('JUSTIFICATIVA_OBRIGATORIA: a solicitação está fora do prazo mínimo de '
                      + sim.antecedenciaMinima + ' dias. Explique o motivo.');
    }

    // campos calculados — nunca vêm do cliente
    reg.ANTECEDENCIA_PRATICADA = sim.antecedenciaPraticada;
    reg.REGRA_ANTECEDENCIA     = sim.regraAntecedencia;
    reg.ALCADA_ID              = sim.alcadaId;
    reg.SALDO_PROJETADO_SEMANA = sim.saldoProjetado;
    reg.RECOMENDACAO           = sim.recomendacao;
    // Transferência tem um pagamento só e custo na rota: nunca rateia.
    const transfere = reg.TIPO_FRETE === 'TRANSFERENCIA';
    reg.TEM_RATEIO             = (sim.exigeRateio && !transfere) ? 'SIM' : 'NAO';
    const rateio = transfere ? null : d.rateio;
    if (!reg.SOLICITACAO_ID) {
      reg.DATA_SOLICITACAO = new Date();
      reg.SOLICITANTE_ID   = ses.id;
      reg.STATUS           = d.enviar ? 'AGUARDANDO_APROVACAO' : 'RASCUNHO';
      reg.ORIGEM           = d.origem || 'WEB';
    } else if (d.enviar) {
      reg.STATUS = 'AGUARDANDO_APROVACAO';
    }

    if (sim.exigeRateio && rateio) Rules.validarRateio(rateio);

    const r = Repo.salvar('SOLICITACOES', reg, ses);
    const id = r.registro.SOLICITACAO_ID;

    if (rateio) {
      Repo.listar('RATEIO', function (x) { return x.SOLICITACAO_ID === id; }, true)
          .forEach(function (x) { Repo.inativar('RATEIO', x.RATEIO_ID, 'substituído', ses); });
      Repo.inserirLote('RATEIO', rateio.map(function (l) {
        return { SOLICITACAO_ID: id, FILIAL_DESTINO: l.filial, CENTRO_CUSTO: l.centroCusto || '',
                 PERCENTUAL: l.percentual, VALOR: Number(reg.VALOR_BRUTO) * Number(l.percentual) / 100 };
      }), ses);
    }

    if (reg.STATUS === 'AGUARDANDO_APROVACAO') Notify.pendenteAprovacao(r.registro);
    return { id: id, registro: r.registro, diff: r.diff, simulacao: sim };
  }

  /** Aprovar, reprogramar ou reprovar. Sem caixa a solicitação é REPROGRAMADA, nunca reprovada. */
  function decidir(d, ses) {
    const s = Repo.achar('SOLICITACOES', 'SOLICITACAO_ID', d.id);
    if (!s) throw new Error('Solicitação não encontrada.');
    if (['AGUARDANDO_APROVACAO', 'REPROGRAMADO', 'AGUARDANDO_CAIXA'].indexOf(s.STATUS) < 0) {
      throw new Error('ESTADO_INVALIDO: esta solicitação não está aguardando decisão.');
    }
    if (!Perm.podeAprovar(ses, s.VALOR_BRUTO)) {
      throw new Error('SEM_ALCADA: o valor de R$ ' + s.VALOR_BRUTO
                      + ' exige a alçada ' + s.ALCADA_ID + ', acima do seu limite.');
    }
    if (!d.justificativa && d.motivo) d.justificativa = d.motivo;
    if (['REPROGRAMAR', 'REPROVAR'].indexOf(d.decisao) >= 0 && !d.justificativa) {
      throw new Error('JUSTIFICATIVA_OBRIGATORIA: explique o motivo da decisão.');
    }

    const cx = Cash.saldoNaData(s.DATA_PREVISTA_PGTO);
    Repo.salvar('APROVACOES', {
      SOLICITACAO_ID: s.SOLICITACAO_ID, NIVEL: d.nivel || 1, APROVADOR_ID: ses.id,
      DECISAO: d.decisao, DATA_DECISAO: new Date(),
      NOVA_DATA_PREVISTA: d.novaData || '', SALDO_PROJETADO: cx.saldo,
      JUSTIFICATIVA: d.justificativa || '', ORIGEM: ses.origem || 'WEB'
    }, ses, { forcar: true });

    if (d.decisao === 'APROVAR') {
      s.STATUS = 'APROVADO';
      // A chave de autorização NÃO nasce aqui.
      //
      // Aprovar é dizer "pode comprar". Autorizar é mandar a capa ao fornecedor — outro
      // ato, outra pessoa, outro momento. Enquanto os dois moravam nesta linha, o portão
      // de "Receber" já nascia aberto na aprovação, e a etapa Autorizar não pedia nada de
      // ninguém: virava um clique para passar adiante.
      //
      // Quem gera a chave agora é Fluxo.autorizar().
    } else if (d.decisao === 'REPROGRAMAR') {
      s.STATUS = 'REPROGRAMADO';
      if (d.novaData) s.DATA_PREVISTA_PGTO = new Date(d.novaData);
    } else if (d.decisao === 'REPROVAR') {
      s.STATUS = 'REPROVADO';
    }
    s.APROVADOR_ID  = ses.id;
    s.DATA_APROVACAO = new Date();
    s.OBSERVACAO = [s.OBSERVACAO, d.justificativa].filter(Boolean).join(' · ');

    const r = Repo.salvar('SOLICITACOES', s, ses, { forcar: true });
    Notify.decisao(r.registro, d.decisao, d.justificativa);
    return { id: s.SOLICITACAO_ID, registro: r.registro, diff: r.diff };
  }

  return { listar: listar, obter: obter, salvar: salvar, decidir: decidir, montarRegistro: montarRegistro };
})();

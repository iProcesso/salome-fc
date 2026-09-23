/**
 * Rules.gs — as regras de negócio da reunião, em código.
 *
 * Duas coisas que não podem se confundir:
 *   1. POLÍTICA FINANCEIRA — quando aquele TIPO de gasto pode ser pago. Fixa, por classificação.
 *   2. APROVAÇÃO DE CAIXA  — se há dinheiro naquela semana. Decisão humana, na reunião.
 * Este arquivo resolve a primeira e informa a segunda. Nunca decide pela pessoa.
 */
const Rules = (function () {

  function feriados() {
    return Repo.listar('FERIADOS').map(function (f) {
      return Utilities.formatDate(new Date(f.DATA), 'America/Sao_Paulo', 'yyyy-MM-dd');
    });
  }

  function ehUtil(d, fer) {
    const dia = d.getDay();
    if (dia === 0 || dia === 6) return false;
    return fer.indexOf(Utilities.formatDate(d, 'America/Sao_Paulo', 'yyyy-MM-dd')) < 0;
  }

  function proximoUtil(d) {
    const fer = feriados();
    const x = new Date(d);
    while (!ehUtil(x, fer)) x.setDate(x.getDate() + 1);
    return x;
  }

  /** Data de pagamento sugerida pela condição. Regra 1 — política financeira. */
  function dataPorCondicao(condicaoId, base) {
    const c = Repo.achar('CONDICOES_PGTO', 'CONDICAO_ID', condicaoId);
    if (!c) return proximoUtil(base);
    const d = new Date(base);
    const p = Number(c.PARAMETRO);

    switch (c.REGRA) {
      case 'ANTECIPADO':
      case 'DIAS_CORRIDOS':
        d.setDate(d.getDate() + p);
        break;
      case 'FORA_SEMANA_DIA': {           // "fora semana, próxima quarta"
        const fimDaSemana = new Date(d);
        fimDaSemana.setDate(d.getDate() + (7 - d.getDay()));   // domingo seguinte
        const alvo = Number(p);                                 // 1=dom … 4=qua
        d.setTime(fimDaSemana.getTime());
        d.setDate(d.getDate() + ((alvo - d.getDay() + 7) % 7 || 7));
        break;
      }
      case 'DIA_FIXO_MES':
        d.setMonth(d.getMonth() + 1, p);
        break;
    }
    return proximoUtil(d);
  }

  function alcadaPara(valor) {
    const lista = Repo.listar('ALCADAS').sort(function (a, b) { return a.NIVEL - b.NIVEL; });
    for (let i = 0; i < lista.length; i++) {
      if (Number(valor) <= Number(lista[i].LIMITE_ATE)) return lista[i];
    }
    return lista[lista.length - 1];
  }

  function diasEntre(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
  }

  /**
   * O que a tela mostra enquanto o usuário digita: regra, alçada, semana e recomendação.
   * NÃO grava nada.
   */
  function simular(d, ses) {
    // A conta não vem da tela. Vem da categoria + do tipo do fornecedor.
    const cls = Catalogo.classificar(d.categoriaId, d.fornecedorId);
    const conta = Repo.achar('PLANO_CONTAS', 'CODIGO', cls.contaCodigo);

    if (conta.TIPO === 'SINTETICA') {
      throw new Error('CONTA_AGRUPADORA: ' + cls.contaCodigo +
        ' é conta de agrupamento e não aceita lançamento. Ajuste a categoria "' +
        cls.categoriaNome + '".');
    }

    const hoje = d.dataSolicitacao ? new Date(d.dataSolicitacao) : new Date();
    const sugerida = dataPorCondicao(d.condicaoId || conta.CONDICAO_PADRAO, hoje);
    const prevista = d.dataPrevista ? new Date(d.dataPrevista) : sugerida;

    // Quem manda no prazo é a categoria; a conta só entra se a categoria não disser nada.
    const antMin = Number(cls.antecedenciaMinima || conta.ANTECEDENCIA_MIN_DIAS || 0);
    const antReal = diasEntre(hoje, prevista);
    const regraOk = antReal >= antMin;

    const bruto = Number(d.valorBruto || 0);
    const alc = alcadaPara(bruto);
    const cx = Cash.saldoNaData(prevista);
    const saldoMin = Number(Cfg.param('SALDO_MINIMO_SEGURANCA', 0));

    const ret = cls.retencao;
    const valorRetido = bruto * (Number(ret.aliquotaTotal || 0) / 100);

    // Rateio: exigido quando a categoria atende mais de uma filial ou o centro é transferência.
    const exigeRateio = conta.EXIGE_RATEIO === 'SIM' ||
                        String(d.centroCusto || cls.centroSugerido) === 'TRF';

    let recomendacao, motivo;
    if (cx.semana === null) {
      recomendacao = 'AVALIAR'; motivo = 'A data está fora do horizonte projetado do fluxo de caixa.';
    } else if (cx.saldo < 0) {
      recomendacao = 'REPROGRAMAR'; motivo = 'A semana ' + cx.semana + ' fecha com caixa negativo.';
    } else if (cx.saldo < saldoMin) {
      recomendacao = 'AVALIAR'; motivo = 'Saldo da semana abaixo do mínimo de segurança.';
    } else if (!regraOk && !d.emergencial) {
      recomendacao = 'AVALIAR';
      motivo = '"' + cls.categoriaNome + '" pede ' + antMin + ' dias de antecedência; foram pedidos ' + antReal + '.';
    } else {
      recomendacao = 'LIBERAR'; motivo = 'Há caixa na semana e a regra de antecedência foi cumprida.';
    }

    return {
      categoriaId: cls.categoriaId, categoriaNome: cls.categoriaNome,
      contaCodigo: cls.contaCodigo, contaDescricao: cls.contaDescricao,
      classificacao: conta.CLASSIFICACAO, grupoDre: conta.GRUPO_DRE, natureza: conta.NATUREZA,
      tipoLancamento: conta.TIPO_LANCAMENTO,
      centroSugerido: cls.centroSugerido,
      centrosValidos: Catalogo.centrosDaConta(cls.contaCodigo),
      exigePlaca: cls.exigePlaca,
      exigeRateio: exigeRateio,
      exigeAnexo: cls.exigeAnexo || conta.EXIGE_ANEXO_ORCAMENTO === 'SIM',
      rateioPadrao: conta.RATEIO_PADRAO ? JSON.parse(conta.RATEIO_PADRAO) : null,
      condicaoSugerida: conta.CONDICAO_PADRAO, dataSugerida: sugerida, dataPrevista: prevista,
      antecedenciaMinima: antMin, antecedenciaPraticada: antReal,
      regraAntecedencia: regraOk ? 'OK' : 'FORA_DO_PRAZO',
      alcadaId: alc.ALCADA_ID, alcadaNome: alc.NOME, aprovador: alc.PERFIL_APROVADOR,
      exigeDupla: alc.EXIGE_DUPLA === 'SIM',
      semana: cx.semana, saldoProjetado: cx.saldo,
      retencao: ret, valorRetido: valorRetido, valorLiquido: bruto - valorRetido,
      podeAprovarSozinho: Perm.podeAprovar(ses, bruto),
      recomendacao: recomendacao, motivo: motivo
    };
  }

  /**
   * Valida o rateio antes de gravar.
   *
   * O rateio da Salomé tem DOIS eixos, e eles não são a mesma coisa:
   *   FILIAL_DESTINO — qual unidade consome (Rio Preto, Campinas, Osasco, São Paulo)
   *   CENTRO_CUSTO   — qual natureza consome (Administrativo, Operacional, Transferência)
   * Os "18% distribuição / 82% transferência" da reunião são CENTRO, não filial.
   * Por isso a soma tem de fechar 100% em cada eixo, e não uma vez só.
   */
  function validarRateio(linhas) {
    if (!linhas || !linhas.length) throw new Error('RATEIO_VAZIO: informe ao menos uma linha de rateio.');

    const soma = linhas.reduce(function (a, l) { return a + Number(l.PERCENTUAL || 0); }, 0);
    if (Math.abs(soma - 100) > 0.001) {
      throw new Error('RATEIO_INVALIDO: a soma dos percentuais é ' + soma.toFixed(2) + '%, deveria ser 100%.');
    }

    const faltando = linhas.filter(function (l) { return !l.FILIAL_DESTINO || !l.CENTRO_CUSTO; });
    if (faltando.length) {
      throw new Error('RATEIO_INCOMPLETO: ' + faltando.length +
        ' linha(s) sem filial ou sem centro de custo. Todo rateio precisa dos dois.');
    }

    // Mesma filial + mesmo centro duas vezes é sempre erro de digitação.
    const vistos = {};
    linhas.forEach(function (l) {
      const k = l.FILIAL_DESTINO + '|' + l.CENTRO_CUSTO;
      if (vistos[k]) {
        throw new Error('RATEIO_DUPLICADO: ' + l.FILIAL_DESTINO + ' / ' + l.CENTRO_CUSTO +
          ' aparece mais de uma vez. Some os percentuais em uma linha só.');
      }
      vistos[k] = true;
    });
    return true;
  }

  /** Os dois totais que as telas gerenciais mostram: por filial e por centro. */
  function totaisRateio(linhas, valor) {
    const porFilial = {}, porCentro = {};
    linhas.forEach(function (l) {
      const v = Number(valor) * Number(l.PERCENTUAL || 0) / 100;
      porFilial[l.FILIAL_DESTINO] = (porFilial[l.FILIAL_DESTINO] || 0) + v;
      porCentro[l.CENTRO_CUSTO]   = (porCentro[l.CENTRO_CUSTO]   || 0) + v;
    });
    return { porFilial: porFilial, porCentro: porCentro };
  }

  return {
    dataPorCondicao: dataPorCondicao, alcadaPara: alcadaPara, simular: simular,
    validarRateio: validarRateio, totaisRateio: totaisRateio,
    proximoUtil: proximoUtil, diasEntre: diasEntre
  };
})();

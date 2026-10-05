/**
 * Cash.gs — projeção do fluxo de caixa.
 *
 * Os três estágios do mesmo compromisso, nunca contados duas vezes:
 *   PREVISTO      → estimativa ou provisão, ainda sem título
 *   COMPROMETIDO  → NF/título recebido, valor e data confirmados
 *   REALIZADO     → pago
 */
const Cash = (function () {

  const ESTAGIO = {
    RASCUNHO: 'EXCLUIDO', CANCELADO: 'EXCLUIDO', REPROVADO: 'EXCLUIDO',
    // EM_VALIDACAO ainda está incompleto, mas o compromisso já existe: entra como previsto,
    // senão o caixa da semana mente para menos justamente no que está travado.
    EM_VALIDACAO: 'PREVISTO', AGUARDANDO_CAIXA: 'PREVISTO',
    AGUARDANDO_APROVACAO: 'PREVISTO', APROVADO: 'PREVISTO', REPROGRAMADO: 'PREVISTO',
    COMPROMETIDO: 'COMPROMETIDO', PAGO: 'REALIZADO'
  };

  function segundaDaSemana(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
  }

  function semanas(qtd, inicio) {
    const base = segundaDaSemana(inicio || new Date());
    const out = [];
    for (let i = 0; i < qtd; i++) {
      const ini = new Date(base); ini.setDate(base.getDate() + i * 7);
      const fim = new Date(ini);  fim.setDate(ini.getDate() + 6); fim.setHours(23, 59, 59);
      out.push({ rotulo: 'S' + (i + 1), inicio: ini, fim: fim });
    }
    return out;
  }

  /** Estágio, data e valor que valem para o fluxo — a mesma lógica das colunas de apoio do mockup. */
  function normalizar(s) {
    const est = ESTAGIO[s.STATUS] || 'EXCLUIDO';
    const data = (est === 'REALIZADO') ? s.DATA_PAGAMENTO : s.DATA_PREVISTA_PGTO;
    const valor = (est === 'REALIZADO') ? Number(s.VALOR_REALIZADO || 0)
                : (s.VALOR_COMPROMETIDO ? Number(s.VALOR_COMPROMETIDO) : Number(s.VALOR_BRUTO || 0));
    return { estagio: est, data: data ? new Date(data) : null, valor: valor };
  }

  /** Matriz completa: entradas, saídas por classificação, três números e saldo acumulado. */
  function fluxo(d, ses) {
    const qtd = Number((d && d.semanas) || Cfg.param('HORIZONTE_SEMANAS', 12));
    const sem = semanas(qtd, d && d.inicio);
    const zeros = function () { return sem.map(function () { return 0; }); };

    const sols = Repo.listar('SOLICITACOES', null, true).map(function (s) {
      return Object.assign({}, s, normalizar(s));
    }).filter(function (s) { return s.estagio !== 'EXCLUIDO' && s.data; });

    const recs = Repo.listar('TITULOS_RECEBER', null, true);
    const contas = Repo.listar('PLANO_CONTAS');

    const idx = function (data) {
      for (let i = 0; i < sem.length; i++) {
        if (data >= sem[i].inicio && data <= sem[i].fim) return i;
      }
      return -1;
    };

    const entradas = { RECEBIDO: zeros(), RECEBIVEL_CONFIRMADO: zeros(), CTE_PREVISTO: zeros() };
    recs.forEach(function (r) {
      const i = idx(new Date(r.DATA_PREVISTA));
      if (i < 0) return;
      const tipo = r.TIPO in entradas ? r.TIPO : 'CTE_PREVISTO';
      entradas[tipo][i] += Number(r.VALOR_RECEBIDO || r.VALOR_PREVISTO || 0);
    });

    const saidas = {};
    const tres = { PREVISTO: zeros(), COMPROMETIDO: zeros(), REALIZADO: zeros() };
    contas.forEach(function (c) { saidas[c.CLASSIFICACAO] = zeros(); });

    sols.forEach(function (s) {
      const i = idx(s.data);
      if (i < 0) return;
      const c = contas.filter(function (x) { return x.CODIGO === s.CONTA_CODIGO; })[0];
      const nome = c ? c.CLASSIFICACAO : '(sem classificação)';
      if (!saidas[nome]) saidas[nome] = zeros();
      saidas[nome][i] += s.valor;
      tres[s.estagio][i] += s.valor;
    });

    const totEnt = sem.map(function (_, i) {
      return entradas.RECEBIDO[i] + entradas.RECEBIVEL_CONFIRMADO[i] + entradas.CTE_PREVISTO[i];
    });
    const totSai = sem.map(function (_, i) {
      return Object.keys(saidas).reduce(function (a, k) { return a + saidas[k][i]; }, 0);
    });

    const saldoMin = Number(Cfg.param('SALDO_MINIMO_SEGURANCA', 0));
    let acumulado = Number(Cfg.param('SALDO_INICIAL_CAIXA', 0));
    const saldoIni = [], saldoAcu = [], situacao = [];
    sem.forEach(function (_, i) {
      saldoIni.push(acumulado);
      acumulado = acumulado + totEnt[i] - totSai[i];
      saldoAcu.push(acumulado);
      situacao.push(acumulado < 0 ? 'CRITICO' : (acumulado < saldoMin ? 'ATENCAO' : 'OK'));
    });

    return {
      semanas: sem, entradas: entradas, totalEntradas: totEnt,
      saidas: saidas, totalSaidas: totSai, tresNumeros: tres,
      saldoInicial: saldoIni, saldoAcumulado: saldoAcu, situacao: situacao, saldoMinimo: saldoMin
    };
  }


  /* ====================================================================== */

  /**
   * A composição EXATA de uma célula do fluxo de caixa: linha × coluna.
   *
   * Por que isto mora no servidor e não na tela. O valor de uma célula não é a soma dos
   * valores brutos das solicitações daquela semana — `normalizar()` escolhe, para cada
   * uma, a data e o valor que valem: quem já foi pago entra pela data e pelo valor do
   * pagamento; quem tem título entra pelo valor comprometido; o resto entra pelo bruto.
   *
   * Refazer essa conta no navegador seria manter a mesma regra em dois lugares, e no dia
   * em que uma mudasse o detalhe passaria a discordar do total — que é o defeito mais
   * caro de um relatório financeiro, porque tira a confiança no número inteiro.
   *
   * Aqui é a MESMA função que soma a célula e lista o que a compõe. Bater é consequência,
   * não coincidência: o `confere` no fim prova isso a cada chamada.
   */
  function detalhe(d, ses) {
    const f = fluxo({ semanas: d.semanas, inicio: d.inicio });
    const i = f.semanas.map(function (s) { return s.rotulo; }).indexOf(d.coluna);
    if (i < 0) throw new Error('SEMANA_DESCONHECIDA: ' + d.coluna + '.');
    const sem = f.semanas[i];

    const contas = {};
    Repo.listar('PLANO_CONTAS').forEach(function (c) { contas[c.CODIGO] = c; });
    const forn = {};
    Repo.listar('FORNECEDORES', null, true).forEach(function (x) { forn[x.FORNECEDOR_ID] = x; });

    const naSemana = Repo.listar('SOLICITACOES', null, true)
      .map(function (s) { return Object.assign({}, s, normalizar(s)); })
      .filter(function (s) {
        return s.estagio !== 'EXCLUIDO' && s.data && s.data >= sem.inicio && s.data <= sem.fim;
      });

    const linha = String(d.linha || '');
    let filtradas, explica;

    if (d.tipo === 'tres') {
      const alvo = linha.toUpperCase();
      filtradas = naSemana.filter(function (s) { return s.estagio === alvo; });
      explica = 'Solicitações no estágio ' + alvo + ' com data nesta semana.';

    } else if (d.tipo === 'totalSaidas') {
      filtradas = naSemana;
      explica = 'Todas as saídas previstas para a semana, em qualquer estágio.';

    } else if (d.tipo === 'entrada') {
      // Entradas vêm de TITULOS_RECEBER, que só será alimentado pela integração do ERP.
      return { linha: linha, coluna: d.coluna, tipo: d.tipo, itens: [], total: 0, confere: true,
               explica: 'As entradas vêm do CT-e e da baixa no ERP. A integração é da Onda 2 — ' +
                        'por isso esta linha ainda não tem composição para mostrar.' };

    } else {
      filtradas = naSemana.filter(function (s) {
        const c = contas[s.CONTA_CODIGO];
        return (c ? c.CLASSIFICACAO : '(sem classificação)') === linha;
      });
      explica = 'Solicitações classificadas em "' + linha + '" com data nesta semana.';
    }

    const itens = filtradas.map(function (s) {
      const c = contas[s.CONTA_CODIGO] || {};
      return {
        id: s.SOLICITACAO_ID,
        fornecedor: (forn[s.FORNECEDOR_ID] || {}).RAZAO_SOCIAL || s.FORNECEDOR_ID,
        descricao: s.DESCRICAO,
        conta: s.CONTA_CODIGO,
        classificacao: c.CLASSIFICACAO || '(sem classificação)',
        filial: s.FILIAL_EMISSAO,
        area: s.AREA_ID,
        status: s.STATUS,
        estagio: s.estagio,
        // Qual data e qual valor entraram na conta — e por quê. É o que explica a
        // diferença entre o valor bruto da solicitação e o que a célula somou.
        data: Utilities.formatDate(s.data, 'America/Sao_Paulo', 'dd/MM/yyyy'),
        origemData: s.estagio === 'REALIZADO' ? 'data do pagamento' : 'previsão de pagamento',
        valor: s.valor,
        valorBruto: Number(s.VALOR_BRUTO || 0),
        origemValor: s.estagio === 'REALIZADO' ? 'valor pago'
                    : (s.VALOR_COMPROMETIDO ? 'valor comprometido na NF' : 'valor bruto solicitado')
      };
    }).sort(function (a, b) { return b.valor - a.valor; });

    const total = itens.reduce(function (a, x) { return a + x.valor; }, 0);

    // A célula que a tela desenhou, recalculada aqui. Se discordar, quem avisa é o
    // relatório, não o usuário seis meses depois.
    let daMatriz = null;
    if (d.tipo === 'tres') daMatriz = f.tresNumeros[linha.toUpperCase()][i];
    else if (d.tipo === 'totalSaidas') daMatriz = f.totalSaidas[i];
    else if (f.saidas[linha]) daMatriz = f.saidas[linha][i];

    return {
      linha: linha, coluna: d.coluna, tipo: d.tipo || 'saida',
      periodo: Utilities.formatDate(sem.inicio, 'America/Sao_Paulo', 'dd/MM') + ' a ' +
               Utilities.formatDate(sem.fim, 'America/Sao_Paulo', 'dd/MM'),
      explica: explica,
      itens: itens, total: total, daMatriz: daMatriz,
      confere: daMatriz === null || Math.abs(daMatriz - total) < 0.005
    };
  }

  /** Usado pela simulação e pelo painel de aprovação: quanto sobra na semana daquela data. */
  function saldoNaData(data) {
    const f = fluxo({});
    const d = new Date(data);
    for (let i = 0; i < f.semanas.length; i++) {
      if (d >= f.semanas[i].inicio && d <= f.semanas[i].fim) {
        return { semana: f.semanas[i].rotulo, saldo: f.saldoAcumulado[i], situacao: f.situacao[i] };
      }
    }
    return { semana: null, saldo: null, situacao: null };
  }

  return { fluxo: fluxo, detalhe: detalhe, saldoNaData: saldoNaData,
           semanas: semanas, normalizar: normalizar };
})();

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

  return { fluxo: fluxo, saldoNaData: saldoNaData, semanas: semanas, normalizar: normalizar };
})();

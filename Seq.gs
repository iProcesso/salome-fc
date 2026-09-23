/**
 * Seq.gs — numeração dos registros.
 * Sempre sob lock: dois usuários salvando ao mesmo tempo não podem receber o mesmo número.
 */
const Seq = (function () {

  const PREFIXO = {
    SOLICITACOES:    'SOL', TITULOS_PAGAR: 'TIT', TITULOS_RECEBER: 'REC',
    IMPORTACOES:     'IMP', APROVACOES:    'APR', RATEIO:          'RAT',
    ANEXOS:          'ANX', NOTIFICACOES:  'NOT', USUARIOS:        'USR',
    FILIAIS:         'FIL', AREAS:         'ARE', PLANO_CONTAS:    'CTA',
    FORNECEDORES:    'FOR', ORCAMENTO:     'ORC', SESSOES:         'SES'
  };

  /** Devolve um ID no formato PREFIXO-ANO-NNNNN. */
  function proximo(tabela) {
    return reservar(tabela, 1)[0];
  }

  /** Reserva N números de uma vez — use na importação em lote. */
  function reservar(tabela, quantos) {
    const pre = PREFIXO[tabela] || tabela.substring(0, 3).toUpperCase();
    const ano = new Date().getFullYear();
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const ctx = Repo.abrir('SEQUENCIAS');
      let linha = -1, ultimo = 0;
      for (let i = 1; i < ctx.valores.length; i++) {
        if (ctx.valores[i][ctx.idx.PREFIXO] === pre && Number(ctx.valores[i][ctx.idx.ANO]) === ano) {
          linha = i + 1;
          ultimo = Number(ctx.valores[i][ctx.idx.ULTIMO_NUMERO]) || 0;
          break;
        }
      }
      const novo = ultimo + quantos;
      if (linha > 0) {
        ctx.sheet.getRange(linha, ctx.idx.ULTIMO_NUMERO + 1).setValue(novo);
        ctx.sheet.getRange(linha, ctx.idx.ATUALIZADO_EM + 1).setValue(new Date());
      } else {
        ctx.sheet.appendRow([pre, ano, novo, new Date()]);
      }
      const ids = [];
      for (let n = ultimo + 1; n <= novo; n++) {
        ids.push(pre + '-' + ano + '-' + ('00000' + n).slice(-5));
      }
      return ids;
    } finally {
      lock.releaseLock();
    }
  }

  return { proximo: proximo, reservar: reservar };
})();

/**
 * Log.gs — log de acesso e trilha de auditoria, em abas semanais.
 *
 * As abas nascem sozinhas na primeira gravação da semana: LOG_ACESSO_2026-S39 e LOG_ATIV_2026-S39.
 * Jobs.arquivarLogs() move as antigas para a planilha de arquivo.
 */
const Log = (function () {

  /** Semana ISO — cuidado: Utilities.formatDate não faz ISO week corretamente na virada do ano. */
  function semanaISO(d) {
    const dt = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dia = dt.getUTCDay() || 7;                 // segunda = 1 … domingo = 7
    dt.setUTCDate(dt.getUTCDate() + 4 - dia);        // quinta da mesma semana
    const ano = dt.getUTCFullYear();
    const inicioAno = new Date(Date.UTC(ano, 0, 1));
    const n = Math.ceil(((dt - inicioAno) / 86400000 + 1) / 7);
    return ano + '-S' + ('0' + n).slice(-2);
  }

  function aba(prefixo) {
    const nome = prefixo + '_' + semanaISO(new Date());
    const ss = Repo.ss('FC_LOG');
    let sheet = ss.getSheetByName(nome);
    if (!sheet) {
      const lock = LockService.getScriptLock();
      lock.waitLock(15000);
      try {
        sheet = ss.getSheetByName(nome);            // outro processo pode ter criado
        if (!sheet) {
          const modelo = (prefixo === 'LOG_ACESSO') ? 'LOG_ACESSO_AAAA-Sww' : 'LOG_ATIV_AAAA-Sww';
          sheet = ss.insertSheet(nome, 0);
          const cab = SCHEMA[modelo].cols;
          sheet.getRange(1, 1, 1, cab.length).setValues([cab])
               .setFontWeight('bold').setBackground('#1F3864').setFontColor('#FFFFFF');
          sheet.setFrozenRows(1);
        }
      } finally { lock.releaseLock(); }
    }
    return sheet;
  }

  function id(pre) {
    return pre + '-' + Utilities.getUuid().substring(0, 8);
  }

  function acesso(email, usuarioId, evento, origem, userAgent, sessaoId, detalhe) {
    try {
      aba('LOG_ACESSO').appendRow([
        id('LOG-A'), new Date(), email || '', usuarioId || '', evento,
        origem || 'WEB', userAgent || '', sessaoId || '', detalhe || ''
      ]);
    } catch (e) { console.error('log acesso: ' + e); }   // log nunca derruba a operação
  }

  /**
   * Uma linha por CAMPO alterado — é o que permite mostrar "valor antes / depois" na ficha.
   * diff = [{campo, antes, depois}]
   */
  function ativ(ses, recurso, acao, registroId, diff) {
    try {
      const agora = new Date();
      const base = [
        '', agora, (ses && ses.email) || 'sistema', (ses && ses.perfilId) || '',
        recurso, acao, registroId || ''
      ];
      const linhas = (diff && diff.length)
        ? diff.map(function (d) {
            return base.slice(0).concat([d.campo, texto(d.antes), texto(d.depois),
                                         (ses && ses.origem) || 'WEB', (ses && ses.sessaoId) || '']);
          })
        : [base.slice(0).concat(['', '', '', (ses && ses.origem) || 'WEB', (ses && ses.sessaoId) || ''])];

      linhas.forEach(function (l) { l[0] = id('LOG-T'); });
      const sheet = aba('LOG_ATIV');
      sheet.getRange(sheet.getLastRow() + 1, 1, linhas.length, linhas[0].length).setValues(linhas);
    } catch (e) { console.error('log ativ: ' + e); }
  }

  function texto(v) {
    if (v === null || v === undefined) return '';
    if (v instanceof Date) return Utilities.formatDate(v, 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm');
    return String(v).substring(0, 300);
  }

  /** Histórico de um registro — é o que a aba "Histórico" da ficha mostra. */
  function historico(registroId, semanas) {
    const ss = Repo.ss('FC_LOG');
    const abas = ss.getSheets().filter(function (s) { return s.getName().indexOf('LOG_ATIV_') === 0; })
                   .sort(function (a, b) { return b.getName().localeCompare(a.getName()); })
                   .slice(0, semanas || 8);
    const out = [];
    abas.forEach(function (s) {
      const v = s.getDataRange().getValues();
      for (let i = 1; i < v.length; i++) {
        if (String(v[i][6]) === String(registroId)) {
          out.push({ ts: v[i][1], email: v[i][2], perfil: v[i][3], recurso: v[i][4],
                     acao: v[i][5], campo: v[i][7], antes: v[i][8], depois: v[i][9], origem: v[i][10] });
        }
      }
    });
    return out.sort(function (a, b) { return new Date(b.ts) - new Date(a.ts); });
  }

  function erro(e, acao, payload) {
    console.error(acao + ' :: ' + e + ' :: ' + JSON.stringify(payload).substring(0, 500));
  }

  return { acesso: acesso, ativ: ativ, historico: historico, erro: erro, semanaISO: semanaISO };
})();

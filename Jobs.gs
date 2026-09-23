/**
 * Jobs.gs — rotinas agendadas.
 * Rode instalarGatilhos() UMA vez, depois de criar as bases.
 */
const Jobs = (function () {

  function instalarGatilhos() {
    ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger('jobBackupDiario').timeBased().atHour(23).everyDays(1).create();
    ScriptApp.newTrigger('jobArquivarLogs').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(3).create();
    ScriptApp.newTrigger('jobLimparSessoes').timeBased().everyHours(6).create();
    return 'gatilhos instalados';
  }

  /** Cópia diária da base, com 30 dias de retenção. Barato e salva o projeto. */
  function backupDiario() {
    const pasta = DriveApp.getFolderById(Cfg.prop('ID_PASTA_BACKUP'));
    const carimbo = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    DriveApp.getFileById(Cfg.prop('ID_FC_DADOS')).makeCopy('FC_DADOS ' + carimbo, pasta);

    const limite = new Date(Date.now() - 30 * 86400000);
    const arquivos = pasta.getFiles();
    while (arquivos.hasNext()) {
      const f = arquivos.next();
      if (f.getDateCreated() < limite) f.setTrashed(true);
    }
    return 'backup ' + carimbo;
  }

  /** Move abas de log antigas para a planilha de arquivo, mantendo o FC_LOG leve. */
  function arquivarLogs() {
    const manter = Number(Cfg.param('LOG_SEMANAS_ONLINE', 12));
    const origem = Repo.ss('FC_LOG');
    let destinoId = Cfg.prop('ID_FC_ARQUIVO');
    if (!destinoId) {
      const ss = SpreadsheetApp.create('FC_ARQUIVO — Salomé');
      DriveApp.getFileById(ss.getId()).moveTo(DriveApp.getFolderById(Cfg.prop('ID_PASTA_RAIZ')));
      destinoId = ss.getId();
      Cfg.setProp('ID_FC_ARQUIVO', destinoId);
    }
    const destino = SpreadsheetApp.openById(destinoId);

    ['LOG_ACESSO_', 'LOG_ATIV_'].forEach(function (pre) {
      const abas = origem.getSheets()
        .filter(function (s) { return s.getName().indexOf(pre) === 0; })
        .sort(function (a, b) { return b.getName().localeCompare(a.getName()); });
      abas.slice(manter).forEach(function (s) {
        s.copyTo(destino).setName(s.getName());
        origem.deleteSheet(s);
      });
    });
    return 'logs arquivados';
  }

  /** Encerra sessões vencidas — a aba SESSOES não pode crescer para sempre. */
  function limparSessoes() {
    const ctx = Repo.abrir('SESSOES');
    const agora = new Date();
    let n = 0;
    for (let i = 1; i < ctx.valores.length; i++) {
      const exp = ctx.valores[i][ctx.idx.EXPIRA_EM];
      const enc = ctx.valores[i][ctx.idx.ENCERRADA_EM];
      if (exp && !enc && new Date(exp) < agora) {
        ctx.sheet.getRange(i + 1, ctx.idx.ENCERRADA_EM + 1).setValue(agora);
        n++;
      }
    }
    return n + ' sessões encerradas';
  }

  return { instalarGatilhos: instalarGatilhos, backupDiario: backupDiario,
           arquivarLogs: arquivarLogs, limparSessoes: limparSessoes };
})();

function instalarGatilhos()  { return Jobs.instalarGatilhos(); }
function jobBackupDiario()   { return Jobs.backupDiario(); }
function jobArquivarLogs()   { return Jobs.arquivarLogs(); }
function jobLimparSessoes()  { return Jobs.limparSessoes(); }

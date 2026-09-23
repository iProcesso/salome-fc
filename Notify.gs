/**
 * Notify.gs — e-mails transacionais.
 * Grava na aba NOTIFICACOES antes de enviar: permite reenvio e evita disparo duplicado.
 * O link leva direto à ficha (#/solicitacao/ID) — é o que derruba o ciclo de aprovação
 * de dias para minutos.
 */
const Notify = (function () {

  function urlApp() {
    return Cfg.prop('URL_APP', ScriptApp.getService().getUrl());
  }

  function enfileirar(dest, tipo, registroId, assunto, corpo) {
    if (!dest) return;
    const r = Repo.salvar('NOTIFICACOES', {
      DATA: new Date(), DESTINATARIO: dest, TIPO: tipo, REGISTRO_ID: registroId || '',
      ASSUNTO: assunto, STATUS_ENVIO: 'PENDENTE', TENTATIVAS: 0, ERRO: ''
    }, null, { forcar: true });

    try {
      MailApp.sendEmail({ to: dest, subject: assunto, htmlBody: corpo,
                          name: 'FC Salomé', noReply: true });
      r.registro.STATUS_ENVIO = 'ENVIADO';
      r.registro.TENTATIVAS = 1;
    } catch (e) {
      r.registro.STATUS_ENVIO = 'ERRO';
      r.registro.TENTATIVAS = 1;
      r.registro.ERRO = String(e).substring(0, 200);
    }
    Repo.salvar('NOTIFICACOES', r.registro, null, { forcar: true });
  }

  function moeda(v) {
    return 'R$ ' + Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
  }

  function link(id) {
    return urlApp() + '#/solicitacao/' + id;
  }

  function pendenteAprovacao(s) {
    const alc = Repo.achar('ALCADAS', 'ALCADA_ID', s.ALCADA_ID);
    const perfil = alc ? alc.PERFIL_APROVADOR : 'DIRETORIA';
    const aprovadores = Repo.listar('USUARIOS', function (u) { return u.PERFIL_ID === perfil; });
    const forn = Repo.achar('FORNECEDORES', 'FORNECEDOR_ID', s.FORNECEDOR_ID);

    aprovadores.forEach(function (u) {
      enfileirar(u.EMAIL, 'PENDENTE_APROVACAO', s.SOLICITACAO_ID,
        s.SOLICITACAO_ID + ' aguarda sua aprovação — ' + moeda(s.VALOR_BRUTO),
        '<p>Olá, ' + u.NOME + '.</p>'
      + '<p><b>' + s.SOLICITACAO_ID + '</b> — ' + (forn ? forn.RAZAO_SOCIAL : '') + '<br>'
      + 'Valor: <b>' + moeda(s.VALOR_BRUTO) + '</b><br>'
      + 'Previsto para: ' + Utilities.formatDate(new Date(s.DATA_PREVISTA_PGTO), 'America/Sao_Paulo', 'dd/MM/yyyy') + '<br>'
      + 'Recomendação do sistema: <b>' + s.RECOMENDACAO + '</b> '
      + '(saldo projetado da semana: ' + moeda(s.SALDO_PROJETADO_SEMANA) + ')</p>'
      + '<p><a href="' + link(s.SOLICITACAO_ID) + '">Abrir para decidir</a></p>');
    });
  }

  function decisao(s, decisao, justificativa) {
    const u = Repo.achar('USUARIOS', 'USUARIO_ID', s.SOLICITANTE_ID);
    if (!u) return;
    const titulo = { APROVAR: 'aprovada', REPROGRAMAR: 'reprogramada', REPROVAR: 'reprovada' }[decisao];
    enfileirar(u.EMAIL, decisao === 'APROVAR' ? 'APROVADO' : (decisao === 'REPROVAR' ? 'REPROVADO' : 'REPROGRAMADO'),
      s.SOLICITACAO_ID,
      'Sua solicitação ' + s.SOLICITACAO_ID + ' foi ' + titulo,
      '<p>Olá, ' + u.NOME + '.</p>'
    + '<p>A solicitação <b>' + s.SOLICITACAO_ID + '</b> (' + moeda(s.VALOR_BRUTO) + ') foi <b>' + titulo + '</b>.</p>'
    + (s.CHAVE_AUTORIZACAO ? '<p>Chave de autorização: <b>' + s.CHAVE_AUTORIZACAO + '</b><br>'
        + 'Informe esta chave ao fornecedor — ela é o que autoriza o faturamento.</p>' : '')
    + (justificativa ? '<p>Observação: ' + justificativa + '</p>' : '')
    + '<p><a href="' + link(s.SOLICITACAO_ID) + '">Ver a solicitação</a></p>');
  }

  return { pendenteAprovacao: pendenteAprovacao, decisao: decisao, enfileirar: enfileirar };
})();

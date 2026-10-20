/**
 * Obs.gs — observações do card. Cada observação é uma linha própria, com autor e data.
 * Não há edição nem exclusão: quem errou escreve outra, e a anterior fica registrada.
 */
const Obs = (function () {

  const MAX = 500;

  /** Confere que a solicitação existe e que o perfil pode vê-la. Devolve a linha. */
  function conferirSolicitacao(id, ses) {
    const sol = Repo.achar('SOLICITACOES', 'SOLICITACAO_ID', id);
    if (!sol) throw new Error('Solicitação ' + id + ' não encontrada.');
    const visiveis = Perm.filtrarEscopo(ses, 'SOLICITACAO', [sol], 'SOLICITANTE_ID', 'FILIAL_EMISSAO');
    if (!visiveis.length) throw new Error('SEM_PERMISSAO: esta solicitação está fora do seu escopo.');
    return sol;
  }

  function listar(d, ses) {
    conferirSolicitacao(d.registroId, ses);
    return Repo.listar('OBSERVACOES', function (o) { return o.SOLICITACAO_ID === d.registroId; }, false)
      .sort(function (a, b) { return new Date(a.CRIADO_EM) - new Date(b.CRIADO_EM); })
      .map(function (o) {
        return { id: o.OBSERVACAO_ID, texto: o.TEXTO, autor: o.CRIADO_POR, quando: o.CRIADO_EM };
      });
  }

  function salvar(d, ses) {
    const texto = String(d.texto || '').trim();
    if (!texto) throw new Error('TEXTO_OBRIGATORIO: escreva a observação.');
    if (texto.length > MAX) throw new Error('TEXTO_LONGO: são no máximo ' + MAX + ' caracteres.');
    conferirSolicitacao(d.registroId, ses);
    const r = Repo.salvar('OBSERVACOES', {
      SOLICITACAO_ID: d.registroId, TEXTO: texto, STATUS: 'ATIVO'
    }, ses);
    Log.ativ(ses, 'SOLICITACAO', 'OBSERVAR', d.registroId, [{ campo: 'OBSERVACAO', antes: '', depois: texto }]);
    return { id: r.registro.OBSERVACAO_ID, mensagem: 'Observação registrada.' };
  }

  return { listar: listar, salvar: salvar };
})();

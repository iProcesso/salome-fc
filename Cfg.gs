/**
 * Cfg.gs — configuração do sistema.
 *
 * Duas fontes, com papéis diferentes:
 *  - ScriptProperties: segredos e IDs de infraestrutura. Nunca vão para a planilha nem para o Git.
 *  - Aba PARAMETROS:   regras de negócio que o usuário pode mudar pela tela.
 */
const Cfg = (function () {

  const SP = PropertiesService.getScriptProperties;

  /** Segredos / IDs. Definidos uma única vez em Setup.criarBases() ou à mão. */
  function prop(chave, padrao) {
    const v = SP().getProperty(chave);
    return (v === null || v === undefined) ? padrao : v;
  }

  function setProp(chave, valor) {
    SP().setProperty(chave, String(valor));
  }

  /** Parâmetros de negócio (aba PARAMETROS), com cache de 10 minutos. */
  function param(chave, padrao) {
    const todos = params();
    return (chave in todos) ? todos[chave] : padrao;
  }

  function params() {
    const cache = CacheService.getScriptCache();
    const bruto = cache.get('PARAMETROS');
    if (bruto) return JSON.parse(bruto);

    const linhas = Repo.listar('PARAMETROS');
    const mapa = {};
    linhas.forEach(function (l) {
      mapa[l.CHAVE] = converter(l.VALOR, l.TIPO);
    });
    try { cache.put('PARAMETROS', JSON.stringify(mapa), 600); } catch (e) { /* segue sem cache */ }
    return mapa;
  }

  function invalidar() {
    CacheService.getScriptCache().remove('PARAMETROS');
  }

  function converter(valor, tipo) {
    switch (tipo) {
      case 'NUMERO':   return Number(valor);
      case 'BOOLEANO': return String(valor).toUpperCase() === 'SIM';
      case 'DATA':     return new Date(valor);
      case 'JSON':     try { return JSON.parse(valor); } catch (e) { return null; }
      default:         return valor;
    }
  }

  return { prop: prop, setProp: setProp, param: param, params: params, invalidar: invalidar };
})();

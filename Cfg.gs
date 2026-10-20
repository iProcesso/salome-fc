/**
 * Cfg.gs — configuração do sistema.
 *
 * Duas fontes, com papéis diferentes:
 *  - ScriptProperties: segredos e IDs de infraestrutura. Nunca vão para a planilha nem para o Git.
 *  - Aba PARAMETROS:   regras de negócio que o usuário pode mudar pela tela.
 */
/**
 * A versão do sistema, num lugar só.
 *
 * Ela estava escrita à mão em dois arquivos, e o Migrar tinha '1.0.4' fixo — de modo que
 * toda migração rebaixava o rodapé para uma versão de três semanas atrás. Número de versão
 * que mente é pior que não ter: some a única forma de saber, olhando a tela, qual código
 * está de fato no ar.
 *
 * Mudou de versão? Mude AQUI, e só aqui.
 */
const VERSAO = '1.3.1';

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

  /**
   * O cache guarda as linhas CRUAS (CHAVE, VALOR, TIPO) e a conversão roda a cada leitura.
   * Antes guardava o mapa já convertido: uma DATA virava Date na leitura da planilha e
   * string ISO quando vinha do cache (JSON não tem Date). O mesmo parâmetro tinha tipos
   * diferentes conforme o cache estivesse quente.
   */
  function params() {
    const cache = CacheService.getScriptCache();
    let linhas = null;
    try {
      const bruto = cache.get('PARAMETROS');
      if (bruto) linhas = JSON.parse(bruto);
    } catch (e) { linhas = null; }

    if (!linhas) {
      linhas = Repo.listar('PARAMETROS').map(function (l) {
        return { CHAVE: l.CHAVE, VALOR: l.VALOR, TIPO: l.TIPO };
      });
      try { cache.put('PARAMETROS', JSON.stringify(linhas), 600); } catch (e) { /* segue sem cache */ }
    }

    const mapa = {};
    linhas.forEach(function (l) {
      mapa[l.CHAVE] = converter(l.VALOR, l.TIPO);
    });
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

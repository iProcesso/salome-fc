/**
 * Catalogo.gs — a camada que traduz a linguagem de quem compra para a linguagem da contabilidade.
 *
 * Premissa, vinda da própria reunião: "quem classifica hoje na Salomé é o Fausto e a Ana,
 * não quem compra". Então o solicitante NUNCA escolhe conta contábil. Ele responde três coisas:
 *
 *      1. O que você vai comprar?      -> CATEGORIA   (lista curta, em português de operação)
 *      2. De quem?                     -> FORNECEDOR  (e o fornecedor já sabe suas categorias)
 *      3. Para quem é o gasto?         -> FILIAL  x  CENTRO DE CUSTO
 *
 * A conta contábil é DEDUZIDA daqui: categoria + tipo do fornecedor (PJ/PF). O Fausto e a Ana
 * continuam donos da classificação — só que agora editando esta tabela uma vez, em vez de
 * corrigir solicitação por solicitação.
 *
 * As categorias são semente: depois da carga elas viram linhas da aba CATEGORIAS e passam a ser
 * editadas pelo app. Desativar uma categoria não apaga nada — some do formulário e pronto.
 */
const Catalogo = (function () {

  /**
   * [ID, BLOCO, NOME, EXEMPLOS, CONTA_PJ, CONTA_PF, CENTRO_PADRAO,
   *  EXIGE_PLACA, EXIGE_ANEXO, RETENCAO, ANTECEDENCIA_MIN_DIAS]
   *
   * RETENCAO: NENHUMA | SERVICO_PJ | SERVICO_PF | FRETE_PF
   * CONTA_PF vazia = categoria que não se compra de pessoa física.
   */
  const CATEGORIAS = [
    // ---- FROTA — o gasto tem placa ----
    ['FR-PEC','FROTA','Peças e acessórios','Filtro, lona de freio, farol, retrovisor','2.08.003','2.08.003','OPE','SIM','NAO','NENHUMA',3],
    ['FR-PNE','FROTA','Pneus, câmaras e recapagem','Pneu novo, recapagem, protetor','2.08.006','2.08.006','OPE','SIM','SIM','NENHUMA',5],
    ['FR-OFI','FROTA','Oficina de terceiros','Mão de obra mecânica, funilaria, elétrica','2.08.009','2.08.009','OPE','SIM','SIM','SERVICO_PJ',3],
    ['FR-BOR','FROTA','Borracharia','Conserto de pneu em trânsito, troca de válvula','2.08.025','2.08.025','OPE','SIM','NAO','SERVICO_PJ',0],
    ['FR-COM','FROTA','Combustível e lubrificante','Diesel, arla, óleo de motor','2.08.001','2.08.001','OPE','SIM','NAO','NENHUMA',0],
    ['FR-LAV','FROTA','Lavagem','Lavagem de cavalo, carreta e baú','2.08.018','2.08.018','OPE','SIM','NAO','SERVICO_PJ',0],
    ['FR-DOC','FROTA','Documentação e seguro do veículo','IPVA, licenciamento, inspeção, seguro','2.08.012','','OPE','SIM','NAO','NENHUMA',10],
    ['FR-RAS','FROTA','Rastreamento e gerenciamento de risco','Mensalidade de rastreador, GR de viagem','2.08.010','','OPE','NAO','NAO','SERVICO_PJ',5],
    ['FR-MAN','FROTA','Contrato de manutenção','Contrato de revisão, plano de manutenção','2.08.026','','OPE','SIM','SIM','SERVICO_PJ',10],
    ['FR-FER','FROTA','Ferramentas e material de oficina','Chave, macaco, estopa, graxa','2.08.027','2.08.027','OPE','NAO','NAO','NENHUMA',3],

    // ---- CARGA E VIAGEM ----
    ['CA-FRE','CARGA','Frete contratado','Agregado, terceiro, redespacho','2.02.002','2.02.001','OPE','NAO','NAO','FRETE_PF',0],
    ['CA-MAN','CARGA','Manuseio de carga','Carga, descarga, ajudante','2.09.004','2.09.004','OPE','NAO','NAO','SERVICO_PF',0],
    ['CA-EMB','CARGA','Embalagem, lona e amarração','Lona, cinta, catraca, filme, pallet','2.09.003','2.09.003','OPE','NAO','NAO','NENHUMA',3],
    ['CA-PED','CARGA','Pedágio e vale-pedágio','Recarga de tag, vale-pedágio','2.08.008','','OPE','NAO','NAO','NENHUMA',0],
    ['CA-VIA','CARGA','Viagem e estadia','Diária de motorista, hotel, refeição em rota','2.08.020','2.08.020','OPE','SIM','NAO','NENHUMA',0],

    // ---- ESTRUTURA — filial e escritório ----
    ['ES-ESC','ESTRUTURA','Material de escritório e expediente','Papel, toner, caneta, impresso','2.03.008','2.03.008','ADM','NAO','NAO','NENHUMA',5],
    ['ES-LIM','ESTRUTURA','Material de limpeza e copa','Produto de limpeza, café, água, descartáveis','2.03.017','2.03.017','ADM','NAO','NAO','NENHUMA',5],
    ['ES-TEC','ESTRUTURA','Informática, software e telefonia','Notebook, licença, link, celular','2.03.007','','ADM','NAO','SIM','SERVICO_PJ',10],
    ['ES-OCU','ESTRUTURA','Energia, água, aluguel e condomínio','Conta de luz, água, aluguel, IPTU','2.03.004','2.03.004','ADM','NAO','NAO','NENHUMA',5],
    ['ES-PRE','ESTRUTURA','Manutenção predial e de equipamentos','Pintura, elétrica, ar-condicionado, empilhadeira','2.03.015','2.03.015','ADM','NAO','SIM','SERVICO_PJ',5],
    ['ES-EPI','ESTRUTURA','Uniformes e EPI','Uniforme, bota, luva, colete','2.01.014','2.01.014','ADM','NAO','NAO','NENHUMA',10],

    // ---- SERVIÇOS E OUTROS ----
    ['SE-TER','SERVICOS','Serviço de terceiros','Serviço avulso não coberto pelas demais','2.02.009','2.02.016','ADM','NAO','SIM','SERVICO_PJ',5],
    ['SE-ASS','SERVICOS','Assessoria e honorários','Contábil, jurídica, fiscal, consultoria','2.02.005','2.02.005','ADM','NAO','SIM','SERVICO_PJ',10],
    ['SE-LOC','SERVICOS','Locação de veículo ou equipamento','Aluguel de carro, empilhadeira, gerador','2.02.021','','ADM','NAO','SIM','SERVICO_PJ',10],
    ['SE-INV','SERVICOS','Investimento / bem do imobilizado','Veículo, máquina, móvel, obra','2.06.012','','ADM','NAO','SIM','NENHUMA',15],
    ['SE-OUT','SERVICOS','Outros (exige justificativa)','O que não se encaixa acima','2.11.004','2.11.004','ADM','NAO','SIM','NENHUMA',5]
  ];

  const BLOCOS = {
    FROTA:     { nome: 'Frota',            ordem: 1, icone: 'truck',    ajuda: 'Gasto que tem placa.' },
    CARGA:     { nome: 'Carga e viagem',   ordem: 2, icone: 'package',  ajuda: 'Gasto que acontece na estrada.' },
    ESTRUTURA: { nome: 'Estrutura',        ordem: 3, icone: 'building', ajuda: 'Gasto da filial ou do escritório.' },
    SERVICOS:  { nome: 'Serviços e outros',ordem: 4, icone: 'briefcase',ajuda: 'Contratação e o que não se encaixa acima.' }
  };

  /** Categorias que o fornecedor do arquivo de PEÇAS E SERVIÇOS já vem marcado. */
  const CAT_FORNECEDOR = {
    FRETE: 'CA-FRE', MANUSEIO: 'CA-MAN', PECAS: 'FR-PEC', PNEUS: 'FR-PNE', OFICINA: 'FR-OFI'
  };

  /* ====================================================================== */

  function listar(incluirInativas) {
    return Repo.listar('CATEGORIAS', null, !!incluirInativas)
      .map(function (c) {
        const b = BLOCOS[c.BLOCO] || { nome: c.BLOCO, ordem: 9 };
        c.BLOCO_NOME = b.nome; c.BLOCO_ORDEM = b.ordem;
        return c;
      })
      .sort(function (a, b) { return (a.BLOCO_ORDEM - b.BLOCO_ORDEM) || a.NOME.localeCompare(b.NOME); });
  }

  function obter(categoriaId) {
    const c = Repo.achar('CATEGORIAS', 'CATEGORIA_ID', categoriaId);
    if (!c) throw new Error('CATEGORIA_DESCONHECIDA: ' + categoriaId);
    return c;
  }

  /**
   * O coração: categoria + fornecedor -> conta contábil, centro sugerido e retenção.
   * Se a categoria não aceita pessoa física, recusa aqui — e não três telas adiante.
   */
  function classificar(categoriaId, fornecedorId) {
    const cat = obter(categoriaId);
    const f = fornecedorId ? Repo.achar('FORNECEDORES', 'FORNECEDOR_ID', fornecedorId) : null;
    const pf = !!(f && String(f.TIPO).toUpperCase() === 'PF');

    const codigo = pf ? cat.CONTA_PF : cat.CONTA_PJ;
    if (!codigo) {
      throw new Error('FORNECEDOR_INCOMPATIVEL: "' + cat.NOME +
        '" não é um gasto que se contrate de pessoa física. Confira o fornecedor.');
    }

    const conta = Repo.achar('PLANO_CONTAS', 'CODIGO', codigo);
    if (!conta) {
      throw new Error('CONTA_AUSENTE: a categoria "' + cat.NOME + '" aponta para a conta ' +
        codigo + ', que não está no plano de contas. Cadastre-a antes de usar esta categoria.');
    }

    return {
      categoriaId: cat.CATEGORIA_ID,
      categoriaNome: cat.NOME,
      contaCodigo: codigo,
      contaDescricao: descricaoUtil(conta),
      centroSugerido: cat.CENTRO_PADRAO,
      exigePlaca: cat.EXIGE_PLACA === 'SIM',
      exigeAnexo: cat.EXIGE_ANEXO === 'SIM',
      antecedenciaMinima: Number(cat.ANTECEDENCIA_MIN_DIAS || 0),
      retencao: retencaoPara(cat, f),
      fornecedorTipo: pf ? 'PF' : 'PJ',
      optanteSimples: f ? f.OPTANTE_SIMPLES : ''
    };
  }

  /** O .xls oficial trouxe as descrições completas; se alguém editar no app, vale a edição. */
  function descricaoUtil(conta) {
    return conta.DESCRICAO;
  }

  /**
   * Retenção. As alíquotas ficam em PARAMETROS, não aqui — quem muda é a contabilidade,
   * sem tocar em código. Isto é uma ESTIMATIVA para a tela e para o fluxo de caixa:
   * o valor oficial é o da nota. Nunca substitui o cálculo fiscal.
   */
  function retencaoPara(cat, forn) {
    const regra = cat.RETENCAO || 'NENHUMA';
    if (regra === 'NENHUMA' || !forn) return { regra: 'NENHUMA', itens: [], aliquotaTotal: 0, aviso: '' };

    const simples = String(forn.OPTANTE_SIMPLES).toUpperCase() === 'SIM';
    const pf = String(forn.TIPO).toUpperCase() === 'PF';
    const n = function (k, d) { return Number(Cfg.param(k, d)); };
    const itens = [];

    if (regra === 'SERVICO_PJ' && !pf) {
      if (simples) {
        itens.push({ tributo: 'IRRF/CSRF', aliquota: 0, nota: 'Optante do Simples — dispensado.' });
      } else {
        itens.push({ tributo: 'IRRF',  aliquota: n('RET_IRRF_PJ', 1.5) });
        itens.push({ tributo: 'CSRF',  aliquota: n('RET_CSRF_PJ', 4.65), nota: 'PIS/COFINS/CSLL, acima do piso mensal.' });
      }
      itens.push({ tributo: 'ISS', aliquota: n('RET_ISS', 0), nota: 'Conforme o município do serviço.' });
    }

    if (regra === 'SERVICO_PF' || (regra === 'SERVICO_PJ' && pf)) {
      itens.push({ tributo: 'INSS', aliquota: n('RET_INSS_PF', 11) });
      itens.push({ tributo: 'IRRF', aliquota: 0, nota: 'Tabela progressiva — calculado na folha.' });
      itens.push({ tributo: 'ISS',  aliquota: n('RET_ISS', 0), nota: 'Conforme o município do serviço.' });
    }

    if (regra === 'FRETE_PF' && pf) {
      itens.push({ tributo: 'INSS',       aliquota: n('RET_INSS_FRETE_PF', 11),  nota: 'Sobre 20% do frete.' });
      itens.push({ tributo: 'SEST/SENAT', aliquota: n('RET_SEST_SENAT', 2.5),    nota: 'Sobre 20% do frete.' });
      itens.push({ tributo: 'IRRF',       aliquota: 0, nota: 'Tabela progressiva.' });
    }

    const total = itens.reduce(function (a, i) { return a + Number(i.aliquota || 0); }, 0);
    return {
      regra: regra, itens: itens, aliquotaTotal: total,
      aviso: total > 0
        ? 'Estimativa de retenção. O valor que sai do caixa é o líquido; o bruto é o do compromisso.'
        : ''
    };
  }

  /** Centros válidos para uma conta. Vazio = a relação ainda não foi mapeada -> libera todos. */
  function centrosDaConta(codigo) {
    const rel = Repo.listar('CENTRO_CONTA')
      .filter(function (r) { return r.CODIGO_CONTA === codigo; })
      .map(function (r) { return r.CENTRO_ID; });
    return rel.length ? rel : Repo.listar('CENTROS_CUSTO').map(function (c) { return c.CENTRO_ID; });
  }

  /** Fornecedores de uma categoria. É o que enxuga a lista de 109 para a dezena que interessa. */
  function fornecedoresDaCategoria(categoriaId) {
    const todos = Repo.listar('FORNECEDORES');
    const daCat = todos.filter(function (f) {
      return String(f.CATEGORIAS || '').split('|').indexOf(categoriaId) >= 0;
    });
    // Categoria sem fornecedor marcado (estrutura, serviços) mostra a lista inteira.
    return daCat.length ? daCat : todos;
  }

  return {
    CATEGORIAS: CATEGORIAS, BLOCOS: BLOCOS, CAT_FORNECEDOR: CAT_FORNECEDOR,
    listar: listar, obter: obter, classificar: classificar, retencaoPara: retencaoPara,
    centrosDaConta: centrosDaConta, fornecedoresDaCategoria: fornecedoresDaCategoria,
    descricaoUtil: descricaoUtil
  };
})();

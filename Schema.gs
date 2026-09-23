/**
 * Schema.gs — gerado a partir do dicionário de dados (FC_Salome_Estrutura_Dados_e_Templates.xlsx).
 * NÃO edite à mão sem atualizar o dicionário: este arquivo é o contrato das abas.
 */
const SCHEMA = {
  "PARAMETROS": {
    "pl": "FC_DADOS",
    "desc": "Chave/valor de configuração do sistema. Uma linha por parâmetro.",
    "cols": [
      "CHAVE",
      "VALOR",
      "TIPO",
      "DESCRICAO",
      "PERFIL_QUE_ALTERA"
    ]
  },
  "FILIAIS": {
    "pl": "FC_DADOS",
    "desc": "Unidades da Salomé. Base do rateio e do escopo de acesso.",
    "cols": [
      "FILIAL_ID",
      "CODIGO",
      "NOME",
      "UF",
      "TIPO",
      "CNPJ",
      "CENTRO_CUSTO_PADRAO",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "AREAS": {
    "pl": "FC_DADOS",
    "desc": "Áreas solicitantes. Base do gasto por área e do roteamento de notificação.",
    "cols": [
      "AREA_ID",
      "NOME",
      "RESPONSAVEL_EMAIL",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "CENTROS_CUSTO": {
    "pl": "FC_DADOS",
    "desc": "Os três centros da planilha CENTRO DE CUSTO: Administrativo, Operacional e Transferência.",
    "cols": [
      "CENTRO_ID",
      "NOME",
      "DESCRICAO",
      "ORDEM",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "CENTRO_CONTA": {
    "pl": "FC_DADOS",
    "desc": "Quais contas cada centro de custo usa de fato. Sem linha para a conta, todos os centros valem.",
    "cols": [
      "CENTRO_CONTA_ID",
      "CODIGO_CONTA",
      "CENTRO_ID",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "CATEGORIAS": {
    "pl": "FC_DADOS",
    "desc": "A lista curta que o solicitante ve. E ela que deduz a conta contabil, o centro e a retencao.",
    "cols": [
      "CATEGORIA_ID",
      "BLOCO",
      "NOME",
      "EXEMPLOS",
      "CONTA_PJ",
      "CONTA_PF",
      "CENTRO_PADRAO",
      "EXIGE_PLACA",
      "EXIGE_ANEXO",
      "RETENCAO",
      "ANTECEDENCIA_MIN_DIAS",
      "USO_FREQUENTE",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "PLANO_CONTAS": {
    "pl": "FC_DADOS",
    "desc": "A espinha dorsal. Cada classificação carrega as regras que o formulário aplica sozinho.",
    "cols": [
      "CONTA_ID",
      "CODIGO",
      "DESCRICAO",
      "TIPO",
      "NATUREZA_BC",
      "CONTA_CONTABIL",
      "DESCRICAO_CONTABIL",
      "GRUPO_DRE",
      "CLASSIFICACAO",
      "NATUREZA",
      "TIPO_LANCAMENTO",
      "ANTECEDENCIA_MIN_DIAS",
      "CONDICAO_PADRAO",
      "FORMA_PADRAO",
      "EXIGE_RATEIO",
      "EXIGE_ANEXO_ORCAMENTO",
      "RATEIO_PADRAO",
      "CENTRO_CUSTO",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "FORNECEDORES": {
    "pl": "FC_DADOS",
    "desc": "Só fornecedor ATIVO aparece no formulário de solicitação.",
    "cols": [
      "FORNECEDOR_ID",
      "CODIGO",
      "RAZAO_SOCIAL",
      "NOME_FANTASIA",
      "CNPJ",
      "TIPO",
      "OPTANTE_SIMPLES",
      "CATEGORIAS",
      "CONTA_PADRAO",
      "CONDICAO_PADRAO",
      "FORMA_PADRAO",
      "EMAIL",
      "TELEFONE",
      "CHAVE_PIX",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "CONDICOES_PGTO": {
    "pl": "FC_DADOS",
    "desc": "Regra de data por condição. É a política financeira, não a decisão de caixa.",
    "cols": [
      "CONDICAO_ID",
      "NOME",
      "REGRA",
      "PARAMETRO",
      "PARCELAS",
      "DESCRICAO",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "FORMAS_PGTO": {
    "pl": "FC_DADOS",
    "desc": "Meio de pagamento.",
    "cols": [
      "FORMA_ID",
      "NOME",
      "EXIGE_DADOS_BANCARIOS",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "ALCADAS": {
    "pl": "FC_DADOS",
    "desc": "Faixas de valor e quem decide em cada uma.",
    "cols": [
      "ALCADA_ID",
      "NIVEL",
      "NOME",
      "LIMITE_ATE",
      "PERFIL_APROVADOR",
      "PRAZO_DIAS_UTEIS",
      "EXIGE_DUPLA",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "FERIADOS": {
    "pl": "FC_DADOS",
    "desc": "Usado no cálculo de dias úteis e da próxima janela de pagamento.",
    "cols": [
      "DATA",
      "DESCRICAO",
      "ABRANGENCIA",
      "UF_OU_CIDADE",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "PERFIS": {
    "pl": "FC_DADOS",
    "desc": "Papéis do sistema.",
    "cols": [
      "PERFIL_ID",
      "NOME",
      "DESCRICAO",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "PERMISSOES": {
    "pl": "FC_DADOS",
    "desc": "O coração do controle de acesso: uma linha por PERFIL × RECURSO. SIM/NAO em cada ação.",
    "cols": [
      "PERFIL_ID",
      "RECURSO",
      "VER",
      "INCLUIR",
      "ALTERAR",
      "INATIVAR",
      "APROVAR",
      "EXPORTAR",
      "IMPORTAR",
      "ESCOPO",
      "LIMITE_VALOR"
    ]
  },
  "PERMISSOES_CAMPO": {
    "pl": "FC_DADOS",
    "desc": "Controle fino: quais campos ficam editáveis, por perfil e por status do registro.",
    "cols": [
      "PERFIL_ID",
      "RECURSO",
      "CAMPO",
      "STATUS_REGISTRO",
      "PODE_EDITAR",
      "OBRIGATORIO"
    ]
  },
  "USUARIOS": {
    "pl": "FC_DADOS",
    "desc": "Login próprio. A senha nunca é armazenada em texto — só o hash e o salt.",
    "cols": [
      "USUARIO_ID",
      "NOME",
      "EMAIL",
      "PERFIL_ID",
      "ESCOPO_FILIAL",
      "LIMITE_ALCADA",
      "SENHA_HASH",
      "SENHA_SALT",
      "SENHA_TROCAR",
      "SENHA_EXPIRA_EM",
      "TENTATIVAS_FALHA",
      "BLOQUEADO_ATE",
      "ULTIMO_ACESSO",
      "TELEFONE",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "SESSOES": {
    "pl": "FC_DADOS",
    "desc": "Sessões abertas. O sistema encerra ao expirar ou ao inativar o usuário.",
    "cols": [
      "SESSAO_ID",
      "USUARIO_ID",
      "TOKEN_HASH",
      "CRIADA_EM",
      "EXPIRA_EM",
      "ORIGEM",
      "USER_AGENT",
      "ENCERRADA_EM"
    ]
  },
  "SEQUENCIAS": {
    "pl": "FC_DADOS",
    "desc": "Numeração dos registros. Gravada com LockService para não duplicar.",
    "cols": [
      "PREFIXO",
      "ANO",
      "ULTIMO_NUMERO",
      "ATUALIZADO_EM"
    ]
  },
  "SOLICITACOES": {
    "pl": "FC_DADOS",
    "desc": "A tabela central. Uma linha por compromisso financeiro, do rascunho ao pagamento.",
    "cols": [
      "SOLICITACAO_ID",
      "DATA_SOLICITACAO",
      "SOLICITANTE_ID",
      "AREA_ID",
      "FILIAL_EMISSAO",
      "CENTRO_CUSTO",
      "CATEGORIA_ID",
      "FORNECEDOR_ID",
      "CONTA_CODIGO",
      "PLACA",
      "DESCRICAO",
      "VALOR_BRUTO",
      "CONDICAO_ID",
      "FORMA_ID",
      "DATA_PREVISTA_PGTO",
      "ANTECEDENCIA_PRATICADA",
      "REGRA_ANTECEDENCIA",
      "JUSTIFICATIVA_PRAZO",
      "ALCADA_ID",
      "EMERGENCIAL",
      "SALDO_PROJETADO_SEMANA",
      "RECOMENDACAO",
      "STATUS",
      "APROVADOR_ID",
      "DATA_APROVACAO",
      "CHAVE_AUTORIZACAO",
      "VALOR_COMPROMETIDO",
      "DATA_PAGAMENTO",
      "VALOR_REALIZADO",
      "TEM_RATEIO",
      "RETENCAO_REGRA",
      "RETENCAO_ESTIMADA",
      "VALOR_LIQUIDO",
      "OBSERVACAO",
      "ORIGEM",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "RATEIO": {
    "pl": "FC_DADOS",
    "desc": "Distribuição do valor entre as filiais que consomem. A soma tem de fechar 100%.",
    "cols": [
      "RATEIO_ID",
      "SOLICITACAO_ID",
      "FILIAL_DESTINO",
      "CENTRO_CUSTO",
      "PERCENTUAL",
      "VALOR",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "APROVACOES": {
    "pl": "FC_DADOS",
    "desc": "Trilha de decisão. Uma linha por decisão — inclusive as reprogramações.",
    "cols": [
      "APROVACAO_ID",
      "SOLICITACAO_ID",
      "NIVEL",
      "APROVADOR_ID",
      "DECISAO",
      "DATA_DECISAO",
      "NOVA_DATA_PREVISTA",
      "SALDO_PROJETADO",
      "JUSTIFICATIVA",
      "ORIGEM"
    ]
  },
  "TITULOS_PAGAR": {
    "pl": "FC_DADOS",
    "desc": "Um título por parcela. É o elo entre a solicitação e o pagamento real.",
    "cols": [
      "TITULO_ID",
      "SOLICITACAO_ID",
      "FORNECEDOR_ID",
      "NUM_NF",
      "SERIE_NF",
      "CHAVE_NFE",
      "DATA_EMISSAO",
      "DATA_VENCIMENTO",
      "PARCELA",
      "VALOR_TITULO",
      "VALOR_PAGO",
      "DATA_PAGAMENTO",
      "JUROS_MULTA",
      "DESCONTO",
      "DIVERGENCIA_APROVADO",
      "REAPROVADO",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "TITULOS_RECEBER": {
    "pl": "FC_DADOS",
    "desc": "Entradas. Sem elas o fluxo de caixa não fecha.",
    "cols": [
      "RECEBER_ID",
      "TIPO",
      "CLIENTE",
      "FILIAL",
      "DATA_PREVISTA",
      "VALOR_PREVISTO",
      "VALOR_RECEBIDO",
      "DATA_RECEBIMENTO",
      "NUM_CTE",
      "OBSERVACAO",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "ORCAMENTO": {
    "pl": "FC_DADOS",
    "desc": "A trava anual. Comparada contra previsto, comprometido e realizado.",
    "cols": [
      "ORCAMENTO_ID",
      "ANO",
      "MES",
      "CONTA_CODIGO",
      "FILIAL",
      "AREA_ID",
      "VALOR_ORCADO",
      "STATUS",
      "CRIADO_EM",
      "CRIADO_POR",
      "ALTERADO_EM",
      "ALTERADO_POR",
      "VERSAO",
      "INATIVADO_EM",
      "INATIVADO_POR",
      "MOTIVO_INATIVACAO"
    ]
  },
  "ANEXOS": {
    "pl": "FC_DADOS",
    "desc": "Os arquivos ficam no Drive; aqui só a referência.",
    "cols": [
      "ANEXO_ID",
      "ENTIDADE",
      "REGISTRO_ID",
      "NOME_ARQUIVO",
      "DRIVE_FILE_ID",
      "URL",
      "TIPO",
      "TAMANHO_KB",
      "ENVIADO_EM",
      "ENVIADO_POR"
    ]
  },
  "IMPORTACOES": {
    "pl": "FC_DADOS",
    "desc": "Histórico e rastreabilidade de toda carga de cadastro.",
    "cols": [
      "IMPORTACAO_ID",
      "DATA",
      "ENTIDADE",
      "ARQUIVO",
      "LINHAS",
      "LINHAS_OK",
      "LINHAS_ERRO",
      "RESULTADO",
      "USUARIO",
      "RELATORIO_URL"
    ]
  },
  "NOTIFICACOES": {
    "pl": "FC_DADOS",
    "desc": "Fila de e-mails. Permite reenvio e evita disparo duplicado.",
    "cols": [
      "NOTIF_ID",
      "DATA",
      "DESTINATARIO",
      "TIPO",
      "REGISTRO_ID",
      "ASSUNTO",
      "STATUS_ENVIO",
      "TENTATIVAS",
      "ERRO"
    ]
  },
  "LOG_ACESSO_AAAA-Sww": {
    "pl": "FC_LOG",
    "desc": "Uma aba por semana ISO. Criada automaticamente na primeira gravação da semana.",
    "cols": [
      "LOG_ID",
      "TIMESTAMP",
      "EMAIL",
      "USUARIO_ID",
      "EVENTO",
      "ORIGEM",
      "USER_AGENT",
      "SESSAO_ID",
      "DETALHE"
    ]
  },
  "LOG_ATIV_AAAA-Sww": {
    "pl": "FC_LOG",
    "desc": "Trilha de auditoria. Uma linha por CAMPO alterado — é o que permite mostrar 'valor antes / depois'.",
    "cols": [
      "LOG_ID",
      "TIMESTAMP",
      "EMAIL",
      "PERFIL_ID",
      "RECURSO",
      "ACAO",
      "REGISTRO_ID",
      "CAMPO",
      "VALOR_ANTES",
      "VALOR_DEPOIS",
      "ORIGEM",
      "SESSAO_ID"
    ]
  }
};

/** Nomes das abas da planilha de dados (FC_DADOS). */
const TABELAS_DADOS = Object.keys(SCHEMA).filter(function (k) { return SCHEMA[k].pl === 'FC_DADOS'; });

/** Modelos das abas semanais de log (FC_LOG). */
const TABELAS_LOG = Object.keys(SCHEMA).filter(function (k) { return SCHEMA[k].pl === 'FC_LOG'; });

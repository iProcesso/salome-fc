## 1.0.8 — 2026-09-23 · a URL pública não leva o domínio do dono

O app publicou e o `URL_APP` ficou certo — mas na forma
`script.google.com/a/iprocesso.com/macros/s/ID/exec`. O Google monta assim porque o dono
do script é de lá, e aquele `/a/iprocesso.com` é um pedido de "entre com uma conta deste
domínio".

O pessoal da Salomé não tem conta `@iprocesso.com`. Eles cairiam numa tela de escolha de
conta **antes** de ver o login do app — e parte deles não passaria dali. O sintoma seria
"o link não abre", que é o pior tipo de relato: não diz nada sobre a causa.

A forma curta, `script.google.com/macros/s/ID/exec`, é a mesma implantação e abre para
qualquer um. `urlPublica()` tira o trecho do domínio das duas formas que o Google usa
(`/a/dominio/macros/s/` e `/a/macros/dominio/s/`), e tanto o `doGet` quanto o
`definirUrlDoApp()` guardam só a versão curta. É ela que vai nos e-mails.

## 1.0.7 — 2026-09-23 · a URL que o editor mostra não é a URL do app

`registrarUrlDoApp()` gravou `.../dev`. Está certo do ponto de vista do Apps Script e
errado do ponto de vista de quem vai receber o e-mail: `ScriptApp.getService().getUrl()`
responde conforme quem pergunta. Rodando pelo editor, devolve a URL de **teste**, que só
abre para quem edita o projeto. Só de dentro do app publicado ele devolve a `/exec`.

E não adianta trocar "/dev" por "/exec" no texto: o identificador da implantação de teste
é outro, e a URL montada assim aponta para lugar nenhum.

### A URL se anota sozinha

`doGet` chama `anotarUrlDoApp()`. Ela só grava o que termina em `/exec`, e só se mudou —
uma leitura de propriedade por acesso, nada mais. O primeiro acesso de alguém à versão
publicada é exatamente o momento em que a URL existe e está certa, então é ali que ela
é registrada. Falha de qualquer natureza é engolida: URL é conveniência, e conveniência
não derruba o acesso de ninguém.

`registrarUrlDoApp()` deixou de gravar e passou a **conferir**: mostra a URL guardada, a
que o editor enxerga, e diz em uma linha se falta alguma coisa. `definirUrlDoApp()` é o
caminho manual, para colar a `/exec` — e recusa `/dev` de propósito.

### E o simulador
`HtmlService` devolvia `{}` pelado, e `doGet` termina em `.setTitle().addMetaTag()…` —
o teste morria antes de chegar na asserção. Agora a saída é encadeável, e
`ScriptApp.getService()` existe, para que dê para simular editor e app publicado.

## 1.0.6 — 2026-09-23 · as duas contas do primeiro dia

Antes de criar o usuário, testei o caminho inteiro no simulador — login, lançar uma
solicitação, arrastar pelas seis colunas. O ADMIN trava na primeira: **não consegue nem
abrir solicitação**, e o quadro não aceita card dele.

Isso não é defeito, é a matriz de permissão funcionando. `ADMIN` tem `SOLICITACAO: ver
e exportar`, nada mais, e `MOVE_PERFIL.ADMIN` é lista vazia. Quem configura o sistema não
é quem autoriza o dinheiro — é a separação que qualquer auditoria procura, e mexer nela
para destravar o primeiro dia seria trocar o controle por conveniência.

A saída é outra: **duas contas**. `criarPrimeiroUsuario()` agora cria as duas de uma vez —
a de Administrador, para cadastro, usuário e log, e a de Diretoria, que solicita, aprova
sem teto e move card. Mesma pessoa, dois chapéus, cada ação no log com o chapéu certo.

### `Setup.gs`

- `criarUsuario(nome, email, perfil, escopo, senha)` — o `criarAdmin` virou um caso
  particular dela. Valida o perfil contra a aba `PERFIS`, recusa e-mail repetido, exige
  senha de 8 caracteres e marca troca obrigatória no primeiro acesso.
- `criarEquipe()` — a lista do resto do time. E-mail que já existe é pulado com aviso, e
  rodar de novo é seguro.
- `listarUsuarios()` — quem existe, com perfil, situação e se a senha ainda é provisória.
- `redefinirSenha()` — para quem esquecer. A senha atual não é lida, nem daria: é hash com
  salt por usuário. É substituída.

O e-mail do administrador estava como `kleber@iprocesso.com`; passou a ser o real,
`kleber.zumiotti@iprocesso.com`.

### Testado, não suposto
O simulador percorre o fluxo com a conta de Diretoria: solicitação gravada com a conta
contábil deduzida da categoria, e os cinco arrastos — Validar, Consultar caixa, Aprovar,
Autorizar, Receber — todos aceitos, cada um com a linha no log. Com a conta de
Administrador, o mesmo roteiro para na primeira porta, que é o esperado.

## 1.0.5 — 2026-09-23 · código de conta não é número

O `conferirCarga()` deu o diagnóstico que eu não esperava. Eu procurava linha **sem
chave** — a assinatura da gravação com colunas deslocadas. Não havia nenhuma. As duas
linhas a mais tinham chave, e a mesma chave: **`2.1`**.

O código oficial é `2.10` — DEDUÇÕES DE VENDAS. O Sheets lê `"2.10"` como o número 2,1
e o zero final não some da tela: some do dado. O que fica gravado é o número 2.1. Na
volta, `String(2.1)` é `"2.1"`, que não bate com `"2.10"`, então a carga conclui que a
conta não existe e grava outra. Cada execução acrescenta mais uma cópia. É um laço que
se alimenta sozinho, e por isso `repararCarga()` sozinho não resolveria: apagaria as
duas cópias e a importação seguinte traria uma de volta.

Das 212 contas do plano oficial, **só o `2.10`** é vulnerável. Código com dois pontos
(`2.08.003`) não é número para o Sheets e chega intacto; código de um nível (`2`) vai e
volta com a mesma grafia. Conferi um a um.

### `Import.gs` — duas curas, as duas necessárias

`COLUNAS_TEXTO` lista as colunas que guardam **código**, não número: `CODIGO`,
`CONTA_ID`, `CONTA_CODIGO`, `CONTA_PJ`, `CONTA_PF`, `CNPJ`, `PLACA` e companhia. O
`gravar()` formata essas colunas como texto **antes** do `setValues`. Depois já é tarde:
formato é aparência, e o número já gravado continua número.

`chave()` normaliza a comparação para que o `2.1` que já está na planilha seja
reconhecido como o `2.10` do arquivo — senão a correção só valeria para instalação nova
e a da Salomé continuaria duplicando.

### `Migrar.gs` — consertar o que já está gravado

`corrigirCodigos()` devolve a coluna ao formato texto **e reescreve o valor** com a
grafia oficial. O `repararCarga()` agora faz as duas coisas, nesta ordem: primeiro
remove as repetidas, depois arruma a grafia da que sobrou — reescrever o código de uma
linha que ainda tem duas cópias só espalharia o problema.

O `conferirCarga()` passou a comparar pela chave normalizada. Assim ele enxerga o estado
**misto** — uma linha com `"2.10"` em texto e outra com `2.1` em número — como duas
cópias da mesma conta, que é o que são.

### E o simulador, de novo
O mock aceitava `"2.10"` e devolvia `"2.10"`. Não simulava a coerção do Sheets, então
escondia exatamente este bug. Agora converte texto que parece número, respeita o formato
`@` e move o formato junto quando uma linha é apagada. O teste monta o estado real da
planilha da Salomé — 214 linhas, duas `2.1` — repara, reimporta e confere: 212 contas,
`2.10` como texto, e reimportar de novo não acrescenta nada.

## 1.0.4 — 2026-09-23 · limpar o que a importação interrompida deixou

A carga finalmente passou, com **214 contas** onde deveriam ser 212. O arquivo `Dados.gs`
está limpo — 212 códigos, nenhum repetido. As duas a mais são resto das execuções que
morreram no meio.

E o resto pode ser pior que duplicação. A execução que morreu no cache rodava com o
`Import` **antigo**, que gravava na ordem do SCHEMA numa aba de outra ordem. Linha assim
entra com os valores **deslocados de coluna** — o `CODIGO` cai em outro campo, o `jaTem`
não a reconhece, e a execução seguinte grava tudo de novo. É a mesma causa dos dois
sintomas.

### `conferirCarga()` e `repararCarga()`, dentro do `Migrar.gs`

`conferirCarga()` lê e relata, tabela por tabela: quantas linhas, quantas chaves distintas,
quais linhas estão repetidas e quais estão **sem chave** — a assinatura da gravação torta.

`repararCarga()` remove essas linhas, de baixo para cima (apagar de cima renumera o resto).
Depois é só rodar `importarBaseSalome()` para recompor.

**Só toca em tabela de carga** — plano de contas, categorias, centros, relações e
fornecedores, que são derivadas de arquivo e sempre podem ser refeitas. Solicitação,
título, aprovação, rateio e log ficam de fora: ali a regra continua sendo inativar, nunca
apagar.

### E o simulador, de novo
`deleteRow` no mock era `() => api` — não removia nada. Um teste de limpeza passaria sem
limpar coisa nenhuma. Agora remove de verdade, e o teste que escrevi monta o estrago
(duas duplicadas mais uma linha deslocada), confere o diagnóstico, repara e reimporta.

## 1.0.3 — 2026-09-23 · o cache não cabe, e isso derrubava a importação

`importarBaseSalome` parou com *"Argument too large: value"* em `Repo.gs:58`.

O `CacheService` do Apps Script tem teto de **100 KB por chave** — e quando o valor passa
disso ele **estoura** em vez de simplesmente ignorar. O plano de contas da Salomé, com 212
linhas e 27 colunas, dá **131 KB** em JSON. Toda leitura de `PLANO_CONTAS` derrubava a
chamada inteira.

Cache é otimização, nunca requisito. O que não couber passa a ser lido da planilha toda
vez — mais lento em alguns milissegundos, e correto. `FORNECEDORES` (52 KB) continua
cacheado normalmente.

Três lugares gravavam em cache sem proteção; os três ganharam limite e `try/catch`:
`Repo.listar`, `Cfg.params` e o `doGet` no modo GITHUB (que guardava um HTML de 180 KB).

### E o simulador ficou mais rigoroso
O teste de ponta a ponta não pegou isto porque meu `CacheService` falso aceitava qualquer
tamanho. Agora ele recusa acima de 100 KB, com a mesma exceção do Apps Script. Mock
permissivo esconde exatamente a classe de defeito que ele deveria expor.

## 1.0.2 — 2026-09-23 · fora o escopo que o app não precisa

`migrarEstrutura()` parou com *"Specified permissions are not sufficient to call
Session.getEffectiveUser. Required permissions: …/auth/userinfo.email"*.

A saída óbvia seria acrescentar o escopo ao manifesto. **Não foi essa.** O app tem
autenticação própria: ele não usa, em lugar nenhum, o e-mail da conta Google de quem
executa. Pedir esse escopo seria pedir um dado que não serve para nada — e cada escopo a
mais é uma tela de autorização a mais e um pedaço a mais da conta exposto.

O `Session` saiu do código inteiro:

- `Repo.salvar` assinava a linha com a conta Google quando não havia sessão. Quem assina é
  a **sessão do app**; sem ela, `'sistema'`.
- `Diagnostico` usava a conta Google para saber o dono. Agora tira do parâmetro
  `EMAIL_REMETENTE` ou, na falta dele, do primeiro usuário `ADMIN` da planilha.

O manifesto continua com cinco escopos, os mesmos de sempre. Testado com o objeto `Session`
**removido** do ambiente: migração, importação, criação de usuário, login, bootstrap e
diagnóstico passam todos.

## 1.0.1 — 2026-09-23 · a migração da planilha, e três defeitos que ela revelou

O `importarBaseSalome()` falhou em produção com *"Aba CENTROS_CUSTO não existe"*. A causa
não é a carga: é que `criarBases()` só escreve o cabeçalho quando a aba está **vazia** —
proteção deliberada contra esmagar dados, mas que deixa abas antigas sem as colunas novas.

### `Migrar.gs` — novo
`migrarEstrutura()` cria as abas que faltam e **acrescenta** no fim de cada aba existente
as colunas do SCHEMA que ela não tem. Não apaga, não renomeia, não reordena, não toca em
dado. Coluna nova entra no fim, e isso é seguro porque o `Repo` acha coluna pelo **nome** —
é exatamente para isso que essa regra existe desde o primeiro dia. Idempotente.

`conferirEstrutura()` faz o mesmo diagnóstico sem escrever nada.

Também completa o que entrou depois da carga original: os seis parâmetros de retenção, as
permissões dos recursos `CATEGORIA` e `CENTRO_CUSTO`, e — só se as abas estiverem vazias —
as quatro filiais e as seis áreas. Sem filial e sem área o formulário abre com dois selects
vazios e ninguém consegue lançar.

### Três defeitos que só apareceram com a planilha simulada de ponta a ponta

**1. Gravação pela ordem errada.** `Import.gravar` e `Setup.lote` montavam a linha na ordem
do SCHEMA e gravavam numa aba cuja ordem física é outra. Numa aba migrada as duas ordens
nunca coincidem: as 212 contas teriam entrado com os valores deslocados de coluna, em
silêncio, e o estrago só apareceria dias depois. Agora os dois montam pela ordem **real**
do cabeçalho.

**2. `ses.perfil` não existe.** `Auth.publico()` devolve `perfilId` e `id`. `Vista.gs` e
`Fluxo.gs` — escritos depois — leram `ses.perfil` e `ses.usuarioId`. O bootstrap devolvia
perfil `undefined`, o menu abriria vazio e ninguém veria nada. Derrubaria o app no primeiro
login de verdade.

**3. Código de erro engolindo a mensagem.** `msg.split(':')[0]` devolvia a frase inteira
como código quando não havia prefixo, e a tela mostrava *"E-mail ou senha inválidos. —
E-mail ou senha inválidos."*. Agora o código só é extraído quando a mensagem vem no formato
`CODIGO: texto`, e códigos que viajam sozinhos (`SESSAO_INVALIDA`) ganham frase humana.

### Sobre o teste
Estes três não apareceriam em revisão de código. Apareceram porque a planilha inteira foi
simulada em memória — abas, colunas, SHA-256 real — e o caminho login → bootstrap → quadro
foi percorrido de ponta a ponta antes de o arquivo sair daqui.

## 1.0.0 — 2026-09-23 · o app entra em operação

Duas versões agora. `index.html` continua sendo o protótipo navegável, intacto, com a
faixa azul e os dados fictícios. `app.html` é a **oficial**: sem faixa, com login, lendo
e gravando na planilha.

`doGet` serve a oficial por padrão; o protótipo abre com `?p=proto`.

### O que passou a funcionar de verdade
- **Login** ligado ao `auth.login`, com troca de senha obrigatória quando a atual é
  provisória ou expirou. O token fica em `sessionStorage` e o servidor valida a cada
  chamada — sessão expirada volta para o login dizendo o que houve.
- **`vista.abrir`** monta a tela inteira em um round-trip. No Apps Script o gargalo é a
  latência, não o volume: dez chamadas para abrir uma tela seriam dez segundos.
- **Menu e botões saem da matriz de permissão real**, não de uma lista no código.
- **Formulário** grava com `sol.salvar`. A conta contábil, a alçada e a recomendação são
  calculadas **no servidor** — a tela manda categoria e fornecedor, nunca o código contábil.
- **Quadro Kanban** move com `fluxo.mover`. A regra da tela continua lá, mas só para
  responder na hora; quem decide é o servidor.
- **Aprovar, reprogramar e reprovar** com `sol.decidir`, exigindo justificativa.
- **Descrição de conta** editada na tela grava com `cad.salvar` e entra no log.

### Nada inventado na tela
Os KPIs da abertura e o painel de consistência eram texto fixo no protótipo. Na oficial
saem dos dados: saldo da semana, semanas em atenção, comprometido, atrasadas, sem caixa,
fora do prazo, sem anexo, sem placa, rateio que não fecha. Quando não há pendência, a
tela diz isso — não inventa um número bonito.

### Correções que isto revelou
- `Sol.salvar` ainda chamava `Rules.simular` com `contaCodigo`. Desde a v0.4 a simulação
  pede `categoriaId` + `fornecedorId` — estava quebrado desde então e ninguém tinha
  exercitado o caminho. Agora `Sol.salvar` monta a linha a partir do payload da tela e
  deduz a conta aqui.
- `PC_MAP`, `CAT_MAP` e `FORN_MAP` eram `const`. Recarregar a base estourava em silêncio
  no meio do bootstrap e a tela ficava no login sem dizer por quê.
- A alçada do usuário vinha de um número escrito no código do cliente. Passou a vir do
  perfil, junto com as permissões.

### Arquivos
- `Vista.gs` — novo. O adaptador entre a planilha e a tela.
- `app.html` — novo. A interface oficial.
- `Sol.gs`, `Code.gs` — alterados.

## 0.6.0 — 2026-09-23 · identidade iProcesso e o quadro do processo

### Marca
- Cabeçalho escuro em **#003A5E**, derivado do azul-petróleo do próprio logo da iProcesso.
  Foi o que resolveu um problema real: o texto "Processo" do arquivo é **branco** — 59% dos
  pixels opacos são quase-brancos — e sobre fundo claro simplesmente sumia.
- Paleta tirada do logo: petróleo `#015180`, azul `#1F91D1`, verde `#2A942B`, âmbar `#E0AA08`.
  Substituem o navy genérico em toda a interface.
- O vermelho da Salomé (`#D2010B`) **não** entra na interface. Vermelho aqui já significa
  atraso e erro; usar a cor da marca para isso faria o app gritar o tempo todo. Ele fica no
  logo, que vai sobre uma placa branca no cabeçalho escuro — o "expresso" é preto e precisa
  de fundo claro.
- Os dois logos vão embutidos como data-URI (20 KB somados). Sem rede em tempo de execução.

### Fluxo do processo — o quadro Kanban
Seis colunas, e cada uma segura card de verdade:

| Coluna | O que segura |
|---|---|
| Solicitar | rascunho, ainda com quem pediu |
| Validar | falta anexo, rateio ou placa |
| Consultar caixa | esperando a reunião decidir a semana |
| Aprovar | esperando quem tem a alçada |
| Autorizar | aprovado, falta virar pedido |
| Receber | pedido feito, esperando a NF |

`EM_VALIDACAO` e `AGUARDANDO_CAIXA` são status novos. Entram no fluxo de caixa como
**PREVISTO** — o compromisso existe mesmo travado, e deixá-los de fora faria o caixa da
semana mentir para menos justamente no que está parado.

Reprovado, cancelado e pago saem do quadro e vão para a gaveta do rodapé.

### Arrastar
Três camadas, nesta ordem: é um movimento possível → este perfil move para lá → os
pré-requisitos da coluna estão de pé. Recusa mostra o motivo exato ("R$ 12.600 exige
Alçada 3"), o card balança e volta. Aceite atualiza o status, avisa quem moveu e registra
no log.

Uma exceção pensada: o **número do pedido** é o único pré-requisito que se resolve no
próprio movimento. Em vez de recusar, o app abre e pergunta.

**A regra vale no servidor** (`Fluxo.gs`). A cópia em JavaScript na tela existe só para dar
resposta imediata ao arrastar — cliente pode ser adulterado, servidor não.

### Visão gerencial e leitura
- Cada coluna mostra quantidade, valor somado e a fatia do total.
- Faixa de totais: no quadro, valor, em atraso, suspensos, sem caixa, fora do quadro.
- Filtros por área, filial, centro de custo, tipo de gasto, prazo e valor mínimo, com chips
  removíveis e busca livre.
- Um card tem **um** estado visual dominante — seis cores competindo no mesmo quadro é ruído.
  Atrasado, suspenso, sem caixa, a vencer, em dia, reprovado. Estouro de orçamento entra como
  etiqueta, não como cor de borda.
- Separação que importa: *suspenso* é o que **o solicitante** resolve (anexo, rateio, placa);
  *sem caixa* é decisão de outro. Misturar os dois fazia metade do quadro parecer travada.
- Pré-requisito ainda não exigido aparece em cinza com ○, não em vermelho. Cobrar antes da
  hora ensina a ignorar o alerta.
- Cards expandem e recolhem, um a um ou todos de uma vez.

### Tooltips
Sistema `data-tip` em toda a interface: colunas, cards, etiquetas, filtros, menu lateral e
cada campo do formulário. O texto responde *por que isso importa*, nunca repete o rótulo.

## 0.5.0 — 2026-09-21 · plano de contas oficial (.xls) substitui o PDF

O .xls do plano de contas resolveu de uma vez as três pendências que restavam da v0.4.0.

- **212 contas, nenhuma descrição cortada.** O PDF trazia 58 truncadas ("SINDICATO E",
  "MANUTENCAO DE"). Saíram do sistema as colunas `DESCRICAO_SUGERIDA` e `CONFERIR`, e com
  elas todo o mecanismo de confirmação humana — não há mais o que confirmar.
- **40 contas que o PDF não trazia entraram.** Entre elas `2.08.009` OFICINAS DE TERCEIROS
  e `2.09.004` MANUSEIO DE CARGAS, que sozinhas respondem por 57 dos 109 fornecedores.
  As quatro contas que eu havia deduzido pela posição na sequência estavam corretas.
- **199 relações centro×conta**, contra 112 antes: com as descrições completas, o
  cruzamento com a planilha de centro de custo casa quase tudo. Só ficaram de fora DSR,
  PTS, PLR e Suprimento de Caixa, que não têm conta no plano.

### Correções de mapeamento, agora conferidas contra o plano oficial
- Serviço de terceiros PF: `2.02.012` → `2.02.016` (o 012 é manutenção em sistemas).
- Rastreamento: `2.08.023` → `2.08.010` (RASTREADOR E GERENCIAMENTO RISCOS).
- Investimento: `2.06.003` → `2.06.012` (o 003 é só aquisição de veículos).
- Categoria nova: **Material de limpeza e copa** → `2.03.017`, separada do expediente.
  São 26 categorias.

### Schema
- `PLANO_CONTAS`: `DESCRICAO_SUGERIDA` e `CONFERIR` saem; entram `NATUREZA_BC`,
  `CONTA_CONTABIL` e `DESCRICAO_CONTABIL`, que vieram no .xls.

### Tela do plano de contas
Passou a mostrar **quais categorias caem em cada conta** e um filtro *Só as que o app usa* —
28 das 212. As demais são folha, imposto e despesa financeira, que não passam por
solicitação de compra de propósito. O botão de editar descrição continua, agora como
ajuste normal, não como correção de defeito de origem.

## 0.4.0 — 2026-09-21 · a base oficial da Salomé entra no app

Os três arquivos oficiais (PLANO DE CONTAS.pdf, CENTRO DE CUSTO.xlsx, PEÇAS E SERVIÇOS.xlsx)
deixaram de ser anexo e viraram a base do sistema.

### O que mudou no fluxo
- **O solicitante não escolhe mais conta contábil.** Ele escolhe uma **categoria** em
  linguagem de operação ("Pneus, câmaras e recapagem"). A conta é deduzida da categoria
  mais o tipo do fornecedor. Quem classifica continua sendo o Fausto e a Ana — só que
  editando uma tabela, e não corrigindo solicitação por solicitação.
- **Centro de custo virou campo próprio**, separado da filial. São dois eixos: filial diz
  *quem paga*, centro diz *qual natureza consome*. O rateio usa os dois.
- **Placa obrigatória** nas categorias de frota — sem ela não há custo por veículo.
- **Retenção estimada na tela**, a partir do Simples do fornecedor e do tipo de serviço.

### Arquivos novos
- `Catalogo.gs` — categoria → conta, centro sugerido, retenção. O tradutor do sistema.
- `Dados.gs` — carga gerada dos três arquivos (172 contas, 112 relações, 109 fornecedores).
- `Import.gs` — `importarBaseSalome()` e `conferirBaseSalome()`, idempotentes.

### Schema
- Tabelas novas: `CENTROS_CUSTO`, `CENTRO_CONTA`, `CATEGORIAS`.
- `PLANO_CONTAS` ganhou `DESCRICAO`, `TIPO`, `DESCRICAO_SUGERIDA`, `CONFERIR`.
- `FORNECEDORES` ganhou `OPTANTE_SIMPLES` e `CATEGORIAS`; `CNPJ` entra vazio.
- `SOLICITACOES` ganhou `CENTRO_CUSTO`, `CATEGORIA_ID`, `PLACA`, `RETENCAO_REGRA`,
  `RETENCAO_ESTIMADA`, `VALOR_LIQUIDO`.
- **Corrigido:** `SOLICITACOES` tinha `STATUS` **duas vezes** — o do fluxo e o do bloco de
  auditoria. Com coluna por nome, a segunda vencia: inativar um registro apagaria o status
  do fluxo. Ficou um só; baixa lógica de solicitação é `CANCELADO`.

### Regras
- `Rules.simular` recebe `categoriaId` + `fornecedorId` e recusa conta sintética.
- `Rules.validarRateio` exige os dois eixos, recusa linha incompleta e dupla repetida.
- `Rules.totaisRateio` devolve totais por filial e por centro.
- Alíquotas de retenção em `PARAMETROS` — a contabilidade muda sem tocar em código.

### O que ficou pendente de gente
- 25 contas cortadas no PDF com **sugestão** recuperada do centro de custo: confirmar na
  tela do plano de contas (botão *Completar texto*).
- 33 contas cortadas **sem** fonte para completar.
- 4 contas que a operação usa e o PDF não traz — oficina de terceiros, manuseio de carga,
  recapagem e multas de trânsito. Código deduzido pela posição; **confirmar com a contabilidade**.
- 109 fornecedores sem CNPJ.


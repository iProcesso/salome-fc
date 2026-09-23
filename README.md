# FC Salomé — Apontamento Financeiro de Compras

App da Salomé (transportadora) construído pela **iProcesso**.
Backend em Google Apps Script, base de dados em Google Sheets, interface em HTML versionada aqui.

> **Este repositório é a fonte da verdade do código.** O que está publicado no Apps Script
> deve sempre corresponder ao que está na `main`.

---

## Estrutura

| Caminho | O que é |
|---|---|
| `app.html` | **A interface oficial.** Exige login, lê e grava na planilha |
| `index.html` | O protótipo navegável, com dados fictícios. Abre com `?p=proto` |
| `build_app.py` | Gera `app.html` a partir de `index.html` — as telas são as mesmas |
| `*.gs` | Os 15 arquivos do backend, com **exatamente o mesmo nome** que têm no editor do Apps Script |
| `appsscript.json` | Manifesto: fuso `America/Sao_Paulo`, escopos, configuração do Web App |
| `docs/` | Dicionário de dados (26 tabelas, 369 colunas) e modelos de importação |
| `.github/workflows/deploy.yml` | Publicação automática via `clasp` no merge da `main` |
| `CHANGELOG.md` | O que mudou em cada versão |

**Por que tudo na raiz e não em `src/`:** os nomes dos arquivos aqui são os mesmos do editor
do Apps Script. Se estivessem em `src/server/`, o `clasp push` criaria arquivos chamados
`src/server/Code` **ao lado** dos que já existem — duas declarações de cada `const` global, e o
projeto para de carregar. Raiz plana evita essa armadilha.

---

## Como atualizar o app

### Caminho manual (o que está em uso hoje)

1. Edite o arquivo aqui no GitHub (ou faça o commit pelo seu editor).
2. Abra o projeto no Apps Script e cole o conteúdo no arquivo de mesmo nome.
3. **Implantar → Gerenciar implantações → ✏️ → Versão: Nova → Implantar.**
   Editar o código não muda o que está publicado. E use sempre a **mesma implantação** —
   criar uma nova troca a URL e todo mundo perde o favorito e o ícone no celular.
4. Atualize o `CHANGELOG.md` e o parâmetro `VERSAO_APP` na aba `PARAMETROS`.

### Caminho automático (`clasp`)

```bash
npm i -g @google/clasp
clasp login
clasp clone <SCRIPT_ID> --rootDir .     # o SCRIPT_ID está em Configurações do projeto
clasp push
clasp deploy -i <DEPLOYMENT_ID> -d "v0.3.0 — formulário em acordeão"
```

`.clasp.json` fica fora do Git (está no `.gitignore`) porque carrega o `scriptId`, que é
diferente em DEV e em produção.

Para ligar a GitHub Action, crie três *secrets* no repositório:
`CLASP_CREDENTIALS` (conteúdo do `~/.clasprc.json`), `SCRIPT_ID` e `DEPLOYMENT_ID`.

---

## Duas versões, de propósito

`doGet` serve a **oficial** por padrão. O protótipo só abre com `?p=proto` na URL:

| | Oficial (`app.html`) | Protótipo (`index.html`) |
|---|---|---|
| Entrada | login obrigatório | abre direto |
| Dados | da planilha, via `vista.abrir` | fictícios, dentro do arquivo |
| Perfil | o de quem entrou | trocável no cabeçalho |
| Gravação | grava e registra no log | só mostra um aviso |
| Para quê | o time usar | apresentar e desenhar telas novas |

O protótipo não é enfeite: é onde se desenha tela nova sem risco de encostar na base real.
As telas são as mesmas nos dois — `build_app.py` gera a oficial a partir dele, justamente
para as duas não divergirem na primeira correção.

## A interface servida a partir daqui

O parâmetro `UI_SOURCE`, na aba `PARAMETROS`, decide de onde vem o HTML:

- **`LOCAL`** (padrão) — o `index.html` que está dentro do projeto Apps Script.
  Sem dependência de rede em tempo de execução. É o modo de produção.
- **`GITHUB`** — o `doGet` busca este arquivo e guarda em cache por 6 h.
  Coloque em `GITHUB_RAW`:
  `https://raw.githubusercontent.com/iProcesso/salome-fc/main/index.html`
  Depois de um push, rode `limparCacheUI` para recarregar na hora.

Nos dois modos quem serve a página é o `HtmlService`. **Publicar a página pelo GitHub Pages e
abrir a URL do Pages não funciona**: `google.script.run` só existe dentro de uma página servida
pelo `HtmlService`, e pela URL do Pages não há ponte com o servidor — o app abriria bonito e
sem dado nenhum. O Pages serve, no máximo, como espelho para visualizar o protótipo.

---

## Configuração inicial (uma vez)

No editor do Apps Script, com os arquivos no lugar:

1. `criarBases` — cria a pasta `FC Salomé` no Drive, as planilhas `FC_DADOS` e `FC_LOG`,
   as 26 abas com cabeçalho e os cadastros-semente.
2. `criarPrimeiroUsuario` — edite as três constantes no topo da função e execute.
3. `instalarGatilhos` — backup diário, arquivamento de log e limpeza de sessões.
4. *Implantar → Nova implantação → App da Web*, **Executar como: Eu** e
   **Quem pode acessar: Qualquer pessoa**.
5. `registrarUrlDoApp` e depois **`diagnosticar`** — o relatório completo do que está pronto
   e do que falta, separando bloqueante de aviso. Rode sempre que algo parecer estranho.

---

## Segurança

- O `PEPPER` das senhas é gerado sozinho no primeiro uso e vive em *Propriedades do script*.
  **Nunca** entra neste repositório. Se trocar de projeto Apps Script, copie-o antes — sem ele
  nenhuma senha existente valida.
- Os IDs das planilhas também ficam em *Propriedades do script*, não em arquivo.
- As planilhas são privadas na conta dona do script. Com *executar como eu*, ninguém do time
  precisa de acesso a elas.

---

## O que ainda falta

A interface ainda usa os dados do protótipo — mas agora o protótipo carrega a **base real**:
as 212 contas do plano oficial, os 109 fornecedores e as 26 categorias. A ligação com o servidor é mecânica:
dentro do `<script>` de `index.html` existe `api(acao, payload)`; basta trocar os arrays
`SOL`, `FLOW` e `USUARIOS` pelas chamadas `bootstrap`, `sol.listar` e `cash.fluxo`.

Faltam ainda: tela de login ligada ao `auth.login`, `Files.gs` (anexos no Drive e capa de
autorização em PDF) e as telas de título e orçamento.

### Ordem recomendada

1. `importarBaseSalome()` — carrega contas, centros, categorias e fornecedores.
2. `conferirBaseSalome()` — diz o que ficou pendente de gente.
3. Ligar login → `bootstrap` → formulário. **Nesta ordem**: enquanto a implantação está como
   "qualquer pessoa" e o login é só visual, ligar o backend antes do login abre a base.
4. Piloto de duas semanas com Maitê, Celso e Ana, em paralelo ao processo atual.

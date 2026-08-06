# Decisões técnicas — Sistema de Inventário de Hardware (Cobratec TI)

Registro do "porquê" das escolhas relevantes do projeto.

## 1. SQLite como fonte única de verdade

**Decisão:** o banco SQLite (`prisma/dev.db`) é a fonte de verdade. O Excel é
um relatório de saída, gerado sob demanda.

**Por quê:** o sistema é interativo, com escrita concorrente (vários CRUDs no
dia a dia). Usar o Excel como banco corromperia o arquivo sob escrita
simultânea e travaria edições. SQLite é simples (um arquivo só), zero
configuração e suficiente para uma ferramenta interna de rede local.

## 2. Catálogo de tipos de componente em tabela, não enum

**Decisão:** `TipoComponente` é uma tabela com CRUD na UI, não um enum no código.

**Por quê:** flexibilidade é o princípio número um. O analista de TI precisa
adicionar tipos novos (ex: "Webcam", "No-break") sem deploy nem migração.

## 3. `especificacoes Json?` por componente

**Decisão:** cada `Componente` tem um campo JSON livre de chave/valor.

**Por quê:** permite registrar atributos variáveis (capacidadeGB, tecnologia,
modelo...) sem alterar o schema a cada novo tipo de hardware.

## 4. `cargo` como texto livre

**Decisão:** o cargo do funcionário é `String`, não uma lista fixa.

**Por quê:** não engessar a estrutura organizacional. Cargos mudam e variam.

## 5. Remoção de funcionário com computador

**Decisão:** ao remover um funcionário que possui computadores, a API bloqueia
por padrão (HTTP 409) e exige confirmação explícita (`?liberar=1`), que solta
os computadores para "sem funcionário" (estoque) antes de remover. Também é
possível apenas **inativar** o funcionário, preservando o histórico.

**Por quê:** evita perda acidental de vínculo e mantém rastreabilidade.

## 6. Excel: barras de dados em vez de gráficos nativos no Dashboard

**Decisão:** a aba "Dashboard" do `.xlsx` usa tabelas de indicadores com
**barras de dados (data bars)** via formatação condicional, em vez de gráficos
(chart objects) nativos do Excel.

**Por quê:** a biblioteca `exceljs` **não suporta a criação de gráficos nativos
do Excel na escrita** — apenas a leitura de gráficos existentes. As barras de
dados são um recurso nativo do Excel (não imagem estática), atualizam junto com
as células e atendem ao requisito de visualização sem depender de imagem. A aba
"Inventário" traz todos os dados; a aba "Dashboard" traz os mesmos indicadores
que aparecem no site (total, por cargo, por tipo, estoque).

**Alternativa considerada:** trocar `exceljs` por uma lib com suporte a charts.
Foi descartado para manter o projeto enxuto e a dependência única já adotada.
Se gráficos nativos virarem requisito firme, reavaliar uma lib específica.

## 8. Login/licenças/conta como campos do Computador (não tabela à parte)

**Decisão:** `loginPadrao` (COB-número), `senha` (senha de acesso da máquina),
`licencaWindows`, `licencaMicrosoft` (Microsoft 365 / Office) e `contaOutlook`
foram adicionados como campos opcionais (`String?`) diretamente no model
`Computador`. No `Funcionario`, as credenciais `loginSiscobra`/`senhaSiscobra` e
`loginVonix`/`senhaVonix` seguem o mesmo padrão e substituíram a antiga
`matricula`. Senhas ficam em texto puro: é um cofre interno de TI em LAN
restrita, cujo propósito é justamente recuperar a credencial — não há login de
usuário final para comparar hash.

**Por quê:** são atributos 1:1 da máquina, sempre presentes no mesmo registro.
Uma tabela relacionada só se justificaria se essas licenças/contas circulassem
entre computadores de forma independente (reatribuição com histórico), o que
não é o caso hoje. Campos diretos mantêm o projeto enxuto e a edição num único
formulário. Se virar necessidade rastrear licenças como ativos móveis, migrar
para um model próprio depois.

**Semântica de limpeza:** na API, campo de texto ausente não altera o valor
(PATCH parcial); string vazia (`""`) grava `null` (permite limpar pela edição).

**Observação de segurança:** chaves de licença e contas ficam em texto no
SQLite. Aceitável para ferramenta interna em rede restrita; não armazenar senhas
aqui.

## 7. UI: shadcn/ui escrito à mão

**Decisão:** os componentes de UI (button, card, dialog, select, table...) foram
incluídos diretamente em `/components/ui` seguindo o padrão shadcn/ui, sem rodar
o CLI interativo.

**Por quê:** mantém o projeto enxuto, sem etapa interativa de scaffolding, e dá
controle total sobre o código dos componentes.

## 9. Postura de segurança e acesso

**Contexto:** ferramenta interna, sem autenticação, para rodar em rede restrita
do escritório (não é exposta na internet).

**Pontos sensíveis e mitigação:**

- O banco `prisma/dev.db` guarda chaves de licença e contas de e-mail em texto.
  Tratá-lo como arquivo sensível: restringir acesso ao servidor/máquina onde
  roda e proteger os **backups** (eles também contêm os dados). Não armazenar
  **senhas** no sistema.
- Como não há login, qualquer um com acesso de rede ao app pode editar dados.
  Adequado para LAN confiável; se um dia for exposto além do escritório,
  adicionar autenticação antes.

**Dependências (npm audit):** o Next foi fixado na última correção da linha
14.2.x (**14.2.35**), que resolve o aviso de segurança sinalizado na instalação.
Os avisos restantes do `npm audit` só se resolvem migrando para o **Next 16**
(mudança quebradora — React 19, APIs assíncronas) e referem-se majoritariamente
a vetores de DoS / cache poisoning relevantes para apps **expostos
publicamente**. Para uso interno em LAN, optou-se por **não** migrar para o
Next 16 agora. Reavaliar a migração caso o app passe a ser exposto externamente.

**Endurecimento adicionado (sem mudar o padrão):**

- **Headers de segurança** em todas as respostas (`next.config.mjs`):
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy` e `Permissions-Policy`. Custo zero, mitiga
  clickjacking/sniffing. CSP estrita ficou para depois (risco de quebrar os
  estilos inline do Next/Tailwind).
- **Basic Auth opcional** (`middleware.ts`), **desligada por padrão** para
  respeitar a premissa de LAN sem login. Ativa-se definindo `BASIC_AUTH_USER` e
  `BASIC_AUTH_PASS` (ver `.env.example`) — útil se o app sair da rede interna ou
  se quiserem uma barreira simples sem montar um proxy. Quando ligada, vale para
  todas as rotas, inclusive `/api/export`.
- **Limites de tamanho** nas entradas (zod `.max()` e teto de campos em
  `especificacoes`) — ver os schemas em `lib/validations.ts`.

## 10. Periféricos como booleans de presença (sem modelo)

**Decisão:** mouse, teclado e headset são três booleans diretos no model
`Computador` (`temMouse`, `temTeclado`, `temHeadset`) — registram **apenas a
presença** do periférico, não marca/modelo. Defaults: `temMouse`/`temTeclado`
`true`, `temHeadset` `false`.

**Por quê:** mouse e teclado normalmente acompanham a máquina (daí o default
`true`); o headset é o item que mais varia entre estações. O TI precisa só saber
"tem ou não tem", não o modelo — então um boolean é mais simples e rápido de
preencher do que um `Componente` no catálogo com especificações. Manter como
campo do `Computador` (e não como tipo de componente) evita poluir o catálogo de
hardware e deixa a edição num clique no formulário.

**Reflexo no resto do sistema:** os três campos aparecem como botões-toggle no
formulário de computador, como badges no card da lista, como colunas
(`Sim`/`Não`) na aba **Inventário** do Excel, e geram a pendência **"Sem
headset"** no Dashboard (site e Excel). Se um dia for preciso rastrear modelo/nº
de série de periférico, promover para `Componente` do catálogo.

## 11. SQLite: modo WAL e índices de chave estrangeira

**Decisão:** habilitar o **modo WAL** do SQLite e criar **índices** nas colunas de
chave estrangeira (`Computador.funcionarioId`, `Componente.computadorId`,
`Componente.tipoId`).

**WAL — por quê:** por padrão o SQLite usa journal "rollback", que bloqueia o
arquivo inteiro durante uma escrita — numa ferramenta multiusuário isso vira
erro `database is locked`. O WAL deixa leituras acontecerem em paralelo a uma
escrita. A configuração é gravada no cabeçalho do arquivo do banco (persiste),
então basta aplicar uma vez: no Docker, o `docker-entrypoint.sh` roda
`prisma db execute` com `prisma/sqlite-wal.sql` a cada boot (idempotente); no
local, há o script `npm run db:wal`. Os arquivos auxiliares `dev.db-wal` e
`dev.db-shm` ficam no `.gitignore`/`.dockerignore`.

**Índices — por quê:** o SQLite **não** cria índice automático para colunas de
FK. As consultas do app filtram/juntam por essas colunas (lista por dono, lookup
de componentes por computador, checagem "tipo em uso"). Os `@@index` no schema
evitam varredura de tabela conforme o inventário cresce. Custo desprezível em
escrita para o volume de um escritório.

## 12. Concorrência otimista na edição de computador

**Decisão:** o `PATCH /api/computadores/[id]` aceita um campo opcional
`esperaAtualizadoEm`. O cliente envia o `atualizadoEm` que carregou; se o
registro tiver sido alterado nesse meio-tempo, a API responde **409** com uma
mensagem pedindo para recarregar, em vez de sobrescrever silenciosamente.

**Por quê:** a ferramenta é multiusuário (vários do TI mexendo ao mesmo tempo).
Sem isso, "last write wins" — dois analistas editando a mesma máquina e um apaga
a alteração do outro sem ninguém perceber. A verificação é **opt-in** (só vale
quando o campo é enviado), então não quebra clientes/scripts que não o mandam.
Comparamos a versão por `toISOString()` (mesma forma que o cliente recebeu no
JSON). Aplicado ao `Computador` por ser a entidade mais editada; os demais
formulários (funcionário, tipo) são simples e de baixa contenção.

## 13. Trilha de auditoria

**Decisão:** um model `LogAuditoria` append-only registra as mutações da API
(criar/editar/remover/mover) das quatro entidades (Computador, Componente,
Funcionário, TipoComponente), com descrição legível, timestamp e o ator. Há a
API `GET /api/auditoria` e a tela `/auditoria` para consulta. Eventos podem ser
**removidos manualmente** pelo TI via `DELETE /api/auditoria/:id` (botão na tela);
essa remoção em si não é registrada, para não gerar um log recursivo.

**Por quê:** é uma ferramenta de TI multiusuário onde "quem mexeu no quê" importa
(responsabilização e histórico, sobretudo em realocações e remoções). O log é
**independente** das entidades (sem FK), para o histórico sobreviver à remoção do
registro de origem — por isso guarda `entidadeId` solto + uma `descricao` já
montada.

**Best-effort:** a gravação do log fica **fora** da transação da mutação e é
envolvida em try/catch — se o log falhar, a operação principal não é afetada
(só registra erro no servidor). Trade-off consciente: preferimos não perder uma
escrita real por causa de uma falha de auditoria.

**Ator (quem):** sem login, normalmente é `null`. Quando a **auth Basic
opcional** (decisão 9) está ligada, o `middleware.ts` injeta o cabeçalho
`x-usuario` com o usuário autenticado e o helper o lê. O middleware **sempre
remove** um `x-usuario` vindo do cliente antes (anti-spoofing), então esse campo
só é preenchido a partir de uma autenticação real.

**Retenção:** sem expurgo automático por ora (volume baixo num escritório). Se
crescer, adicionar uma rotina de limpeza/arquivamento por data (há `@@index` em
`criadoEm`).

**Descrição do "mover":** o log de movimentação registra **origem → destino**
(nome do dono anterior e do novo, ou "estoque" quando não há dono), ex.:
`Computador "PAT-1001" movido de "Ana Souza" para "Carlos Lima"`.

## 14. Sistema de design "etiqueta de patrimônio / painel técnico"

**Decisão:** a UI tem uma identidade própria, derivada do mundo do assunto
(gestão de ativos de TI), em vez do visual padrão de admin dashboard.

- **Paleta:** papel frio de bancada (`--background`) + **teal de diagnóstico**
  como acento (`--primary`); status em verde (em uso) / âmbar (estoque/
  pendência). Tokens em `app/globals.css` (shadcn HSL), com bloco `.dark` pronto.
- **Tipografia:** Space Grotesk (display) + IBM Plex Sans (corpo) + **IBM Plex
  Mono** para dados (identificador, login, licenças — que são códigos). Via
  `next/font` (**self-hosted**: funciona offline na LAN, sem CDN externo).
- **Navegação:** rail lateral no desktop, barra no mobile (`components/shell/nav`).
- **Assinatura:** o card de computador é uma **etiqueta de ativo** — faixa de
  status na lateral, LED, "patrimônio" em mono, ficha de dados monospace; o
  Dashboard usa KPIs e barras como leituras de instrumento.

**Por quê:** o cliente rejeitou o visual templated; a linguagem de etiqueta de
patrimônio/painel técnico é distinta e fiel ao uso (inventário de hardware). O
modo escuro ("rack/terminal") já está nos tokens; falta só um botão de
alternância se for desejado.

## 15. Celular como entidade própria (espelha o Computador)

**Decisão:** o celular corporativo é um modelo `Celular` independente, no mesmo
padrão do `Computador`: pertence a um `Funcionario` (ou fica em estoque com
`funcionarioId` null), pode ser **movido** entre funcionários e tem CRUD próprio
(`/celulares`, `/api/celulares`).

- **Campos próprios de telefonia** (todos opcionais, exceto `identificador`
  único): `numero` (linha), `operadora`, `imei`, além de `apelido` (modelo) e
  `observacoes`. **Sem componentes/hardware** — não se aplica a celular.
- **Mesmas garantias do computador:** validação zod, concorrência otimista
  (`esperaAtualizadoEm`), auditoria das mutações (entidade `"Celular"`) e busca/
  filtros por funcionário e cargo na tela.
- **Integridade no delete de funcionário:** o `DELETE /api/funcionarios/:id`
  passou a contar e liberar **computadores E celulares** (antes só computadores).
  Sem isso, a FK do celular bloquearia a remoção do dono.
- **Dashboard e Excel:** ganharam KPIs de celulares e o Excel uma aba
  **"Celulares"**, mantendo o princípio de que o relatório reflete o site.

**Por quê:** o TI também controla os aparelhos do escritório; reaproveitar o
padrão do computador mantém a UI consistente e a curva de aprendizado zero.

## 16. Docker Compose: nome de projeto fixo

**Decisão:** o `docker-compose.yml` declara `name: inventario-cobratec` no topo.

**Por quê:** sem `name`, o Compose deriva o nome do projeto do diretório atual —
que aqui é `InventárioHardware[2]`, com acento e colchetes. Isso viola a regra
`[a-z0-9][a-z0-9_-]*` e faz o `docker compose up` falhar com "invalid project
name". O `name` explícito torna o boot independente do nome da pasta.

## 17. Depósito: controle de estoque por quantidade

**Decisão:** uma aba **Depósito** (`/deposito`, `/api/deposito`) controla os
suprimentos avulsos guardados em caixas (cabos, mouses, adaptadores...) como um
**estoque por quantidade**, separado de computador/celular.

- **Modelo `ItemDeposito`** (flexível, no espírito do projeto): `nome`,
  `categoria` (texto livre, com sugestões na UI via `<datalist>`), `quantidade`,
  `quantidadeMinima` (alerta de estoque baixo; 0 = sem alerta), `localizacao`
  (qual caixa/prateleira) e `observacoes`. Sem catálogo rígido.
- **"O que tem e o que não tem":** a situação é derivada — `falta` (quantidade
  0), `baixo` (≤ mínimo, com mínimo > 0) ou `ok`. A tela mostra KPIs (tipos,
  unidades totais, em falta, estoque baixo) e destaca cada card por cor.
- **Contagem rápida:** botões **± por item** ajustam a quantidade via
  `PATCH { delta }` — increment atômico no servidor com **piso em 0** e
  **atualização otimista** na UI. Esses ajustes **não** geram auditoria (a
  contagem do dia a dia emitiria eventos demais); criar/editar/remover, sim.
- **Validação:** `quantidade`/`quantidadeMinima` são inteiros ≥ 0 com teto
  (`z.coerce.number().int().min(0).max(1_000_000)`), aceitando número ou string.

**Por quê:** o TI precisa saber rapidamente quanto há de cada insumo e o que
falta repor, sem o peso de modelar cada item como ativo individual.

## 18. Sala como catálogo editável, ligada ao computador e ao funcionário

**Decisão:** o espaço físico do escritório vira o model `Sala` — um **catálogo
editável pela UI** (`/salas`, `/api/salas`), no mesmo padrão do
`TipoComponente`. `salaId` (opcional) foi adicionado ao **`Computador`** e ao
**`Funcionario`**.

- **Campos:** `nome` (único), `predio` e `piso` (texto livre, com sugestões via
  `<datalist>`), `ordem` (exibição), `ativa` e `observacoes`. As 4 salas
  iniciais (93 superior, 93 inferior, Administrativo 83, Judiciário 83) vêm de
  `prisma/salas.cjs` via seed idempotente, mas **nada é fixo no código**:
  cadastrar sala nova é uma tela.
- **Por que nos dois:** são perguntas diferentes. O computador responde *"onde a
  máquina está"* — inclusive uma máquina de estoque, que tem sala mas não tem
  dono. O funcionário responde *"onde a pessoa senta"*. Derivar uma da outra
  deixaria o estoque sem localização (se ficasse só no funcionário) ou perderia
  o mapa de assentos (se ficasse só no computador). Para evitar retrabalho, ao
  escolher o dono no formulário do computador a sala **dele** é sugerida — mas
  só quando nenhuma sala foi definida ainda, para nunca sobrescrever uma escolha
  explícita.
- **Celular fica de fora:** o aparelho anda com a pessoa; nos relatórios a sala
  do celular é a do dono.
- **Remoção:** sala em uso não é removível (**409**, como o tipo em uso), porque
  removê-la apagaria a localização de todos os vinculados. Para tirar de
  circulação sem perder histórico, existe `ativa = false` — a sala some dos
  seletores mas continua nos registros antigos.
- **Reflexo no resto do sistema:** filtro por sala nas listas de computadores e
  funcionários (com a opção "— sem sala definida —", mesma convenção do "sem
  funcionário"), badge no card do computador, coluna **"Sala"** na aba
  Inventário do Excel, coluna "Sala do funcionário" na aba Celulares, bloco
  **"Computadores por sala"** no Dashboard (site e Excel) e a pendência **"Sem
  sala definida"**.

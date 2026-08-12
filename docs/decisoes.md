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

> ⚠️ **SUPERADA PELA DECISÃO 19.** A premissa "sem autenticação, LAN confiável"
> caiu quando o sistema passou a atender também as operadoras (papéis
> administrador × operador). A **Basic Auth opcional descrita abaixo foi
> removida** e substituída por login próprio. O restante (headers de segurança,
> limites de tamanho, política de dependências) continua valendo.

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

### 18.1 Página própria por sala (`/salas/[id]`)

**Decisão:** cada sala tem uma **página própria** com tudo que foi levado para
ela, organizada por **posto de trabalho** — a pessoa e o conjunto dela
(computadores + celulares). A lista `/salas` virou cards clicáveis e os badges
de sala espalhados pelo sistema levam para essa página.

- **Postos × máquinas soltas:** a página tem duas seções. "Postos de trabalho"
  agrupa por funcionário da sala; "Computadores nesta sala sem posto" mostra o
  que está fisicamente aqui mas não pertence a ninguém daqui (estoque parado na
  sala, ou máquina cujo dono senta em outro lugar). A API devolve as duas listas
  cruas (`GET /api/salas/[id]`) e a tela compõe — porque pessoa e máquina podem
  estar em salas diferentes, e **essa divergência é sinalizada** no posto
  (⚠ "está em Sala X"). É exatamente o tipo de inconsistência que o TI precisa
  ver, então a UI aponta em vez de esconder.
- **Celular vem pelo dono:** coerente com a decisão de não dar sala ao aparelho.
- **Movimentação (`POST /api/salas/mover`):** um endpoint só cobre os três
  gestos — trazer para cá, tirar daqui (`destinoSalaId: null`) e mandar para
  outra sala — item a item ou em lote (checkbox + barra de ações). É
  transacional (`$transaction` com dois `updateMany`) e valida o destino antes,
  para um id inválido não virar FK quebrada. A auditoria grava **um evento por
  item movido**, com origem → destino, reaproveitando a semântica de "mover" que
  já existia para o computador.
- **Rota estática antes da dinâmica:** `/api/salas/mover` conviveria com
  `/api/salas/[id]`; no App Router o segmento estático tem precedência, então
  "mover" nunca é lido como um id.
- **Recarga silenciosa:** depois de mover, a página recarrega **sem** trocar o
  conteúdo pelo spinner de tela cheia (só o indicador da ação aparece) — trocar
  tudo faria a tela piscar e perder a posição do scroll no meio de uma
  movimentação em lote.

## 19. Autenticação com papéis (administrador × operador)

**Decisão:** o sistema passou a exigir **login**, com dois papéis: **ADMIN**
(acesso total ao inventário) e **OPERADOR** (só abre e acompanha chamados).
Isso **revoga a premissa da decisão 9** ("LAN confiável, sem login") e **remove a
Basic Auth opcional** — que era uma barreira única para todo mundo e não sabia
distinguir quem é quem.

**Por quê agora:** o sistema deixou de ser usado só pelo TI. As operadoras
precisam abrir chamados, mas não podem ver o cofre de credenciais
(senhas do Siscobra/Vonix, senha do PC, licenças) nem mexer no inventário.
Sem papéis, dar acesso a uma pessoa era dar acesso a tudo.

### Modelo: `Usuario` separado de `Funcionario`

Tabela própria, com vínculo **opcional** ao funcionário. O funcionário é um
registro de inventário (dono de equipamento); o usuário é acesso ao app. Nem
todo funcionário precisa de login, e o TI pode ter login sem estar no
inventário. Misturar os dois obrigaria a criar "funcionário fantasma" para cada
conta de serviço, e ligaria o cadastro de RH ao controle de acesso.

### Senha: scrypt, sem dependência nova

`lib/senha.ts` usa o `scrypt` do próprio Node (formato `scrypt$N$salt$hash`).
bcrypt/argon2 exigiriam dependência nativa compilada na imagem Alpine. O custo
(N) fica guardado junto do hash, então dá para aumentá-lo no futuro sem
invalidar as senhas existentes. A comparação é em tempo constante
(`timingSafeEqual`).

**Distinção importante do projeto:** as senhas do **cofre** (Siscobra, Vonix,
senha do PC — decisão 8) continuam em **texto puro**, porque o propósito delas é
ser *lida de volta* pelo TI. A senha de **login** é o oposto: nunca precisa ser
lida, só comparada — por isso é hash e **não há como recuperá-la**, apenas
redefinir.

### Sessão: cookie assinado, não tabela de sessão

`lib/sessao.ts` emite um cookie httpOnly com HMAC-SHA256 via **Web Crypto**.

**Por que assinado:** o `middleware.ts` do Next 14 roda no runtime **Edge**, onde
o Prisma não funciona. Se a sessão vivesse só no banco, o middleware não teria
como validá-la. Com cookie assinado, ele valida por criptografia — e Web Crypto
existe tanto no Edge quanto no Node.

**Onde entra o banco (revogação):** um cookie assinado continua válido mesmo
depois de o usuário ser inativado ou rebaixado. Por isso **toda leitura no
servidor reconfere no banco** (`lib/sessao-servidor.ts`): o papel que vale é o
do banco, não o do cookie. Isso acontece nas APIs (via `exigirSessao`) **e no
layout raiz** — sem a checagem no layout, um acesso cortado sobreviveria nas
páginas até o cookie expirar. Como um Server Component não pode apagar cookie
durante a renderização, o layout redireciona para `GET /api/sessao/encerrar`,
que apaga o cookie de verdade e devolve ao login.

**AUTH_SECRET é obrigatório:** o app falha ao subir sem ele (e o
`docker-entrypoint.sh` recusa o boot). Um segredo padrão previsível permitiria
forjar sessão de administrador. Trocar o segredo invalida todas as sessões.

### Autorização em duas camadas (o middleware não é a fronteira)

1. **`middleware.ts`** — portão de navegação: sem sessão vai para `/login`
   (401 em `/api/*`); operador fora da lista permitida volta para `/chamados`.
2. **`lib/autorizacao.ts`** — `exigirSessao`/`exigirAdmin` no **início de cada
   rota de API**. Nenhuma rota confia só no middleware.

O motivo da redundância: o middleware depende de um `matcher` por regex. Um erro
nesse padrão desligaria a proteção de rotas inteiras sem nenhum sintoma
aparente. **Isso foi verificado na prática** — com o matcher deliberadamente
alterado para não cobrir `/api`, o operador continuou recebendo 403 e o anônimo
401, vindos das guardas de rota.

### Travas contra tranca (lockout)

O sistema não pode ficar sem administrador. A API recusa (409) rebaixar,
inativar ou remover o **último admin ativo**, e recusa que alguém remova a
própria conta. O seed `prisma/seed-admin.cjs` roda a cada boot e cria o admin
inicial **apenas se não houver nenhum** — se o login já existir, promove em vez
de falhar.

### Senha provisória

Senha definida por outra pessoa (seed ou reset do admin) nasce
`senhaProvisoria = true`, e o login manda direto para a troca de senha. Sem
isso, a senha inicial — que trafega por bilhete ou mensagem — viraria a senha
permanente.

### Consequências

- A auditoria **passa a ter ator sempre preenchido** (via `x-usuario`, que o
  middleware injeta a partir da sessão e **sempre remove** se vier do cliente).
- `BASIC_AUTH_USER`/`BASIC_AUTH_PASS` saíram do `.env.example`, do
  `docker-compose.yml` e do middleware.
- Quem já usava o sistema precisa de conta: no primeiro boot após a atualização,
  entrar com o admin inicial e cadastrar os demais em `/usuarios`.

## 20. Chamados (helpdesk)

**Decisão:** o operador tem uma única função no sistema — **abrir e acompanhar
chamados**. Modelos `Chamado` e `ChamadoMensagem`, com ciclo completo
(aberto → em andamento → aguardando → resolvido → fechado), prioridade,
responsável e conversa.

### Regras nas funções puras (`lib/chamados.ts`)

Quem vê o quê, quem muda o quê e quais transições existem ficam em **funções
puras, sem banco** — e por isso cobertas por testes exaustivos
(`lib/chamados.test.ts`). As rotas só orquestram. Sem isso, a regra mais
sensível do módulo (visibilidade) estaria espalhada em `if`s dentro de handlers,
onde ninguém consegue testá-la sem subir servidor.

### O operador não gerencia a fila

Ele **não** define prioridade, **não** atribui responsável e **não** muda o
andamento. Pode: abrir, responder, **fechar quando o TI marcou como resolvido**
e **reabrir** se o problema voltou. Motivos:

- **Prioridade é decisão do TI.** Se o solicitante escolhesse, todo chamado
  nasceria "urgente" e o campo perderia o sentido. Chamado nasce `normal`
  mesmo que o corpo peça outra coisa — o valor é ignorado, não recusado, para
  não travar quem só quer pedir ajuda.
- **Fechar é do solicitante.** Só quem sentiu o problema sabe se acabou; por
  isso o TI marca "resolvido" e quem confirma o encerramento é o dono.

### Chamado alheio responde 404, não 403

Um 403 confirmaria que aquele identificador existe e é de outra pessoa. Para
quem não é dono nem administrador, o chamado simplesmente **não existe**. Vale
para GET, PATCH e envio de mensagem.

### Nota interna é filtrada no servidor

`ChamadoMensagem.interna` marca conversa do TI sobre o chamado. A filtragem
acontece **antes de virar JSON** (`filtrarMensagens`), não na tela: esconder no
front deixaria a nota trafegando na resposta, visível em qualquer inspeção. Se
um operador enviar `interna: true`, o campo é **ignorado** e a mensagem entra
como pública — ele não teria como criar uma nota que nem ele veria.

### `numero` sequencial calculado na transação

As pessoas se referem ao chamado por um número curto ("o #12"). O SQLite só
aceita `autoincrement()` na chave primária, então o número é calculado como
`max(numero) + 1` **dentro da transação de criação**. A escrita no SQLite é
serializada e o volume é de um escritório — não há corrida real. Se um dia
houver, a `@@unique` no campo faz a segunda escrita falhar em vez de duplicar.

### Contexto sem fricção

O chamado guarda **sala** (herdada do funcionário vinculado ao usuário) e,
opcionalmente, o **equipamento**. A rota `/api/chamados/contexto` devolve apenas
os equipamentos **do próprio solicitante**, para ele só apontar "é neste
computador" em vez de digitar patrimônio. É o único ponto em que um operador
toca em dados de inventário: uma lista curta, só do que é dele, sem credencial
nenhuma.

### Auditoria: sim para o chamado, não para as mensagens

Criação e mudanças de status/prioridade/responsável geram evento. As mensagens
**não**: a própria conversa já é o histórico, com autor e data, e duplicá-la
encheria a auditoria de ruído.

### `resolvidoEm` é limpo ao reabrir

Senão a métrica de tempo de resolução mentiria: um chamado reaberto pareceria
resolvido desde a primeira vez. Ao fechar depois de resolvido, a data original
é preservada.

## 21. Ciclo de vida do ativo e manutenções

**Decisão:** o equipamento passa a ter **estado** (`situacao`) e **histórico de
consertos** (`Manutencao`), além dos dados de compra (aquisição, nota fiscal,
garantia, valor). Vale igual para computador e celular.

### Estado × evento: duas coisas diferentes

- **`situacao`** (`ativo | manutencao | reserva | descartado`) é o **estado**:
  responde "onde este equipamento está na vida útil?" numa olhada.
- **`Manutencao`** é um **evento** com começo e fim: responde "o que já
  aconteceu com ele?".

Guardar só o estado perderia o histórico ("já foi três vezes para o conserto");
guardar só os eventos exigiria varrer a tabela para saber se a máquina está
parada agora. Os dois se mantêm coerentes porque **abrir/concluir manutenção
mexe na situação dentro da mesma transação**.

Nada disso se confunde com **"em uso × estoque"**, que continua sendo derivado
de ter ou não funcionário: uma máquina pode estar em manutenção e continuar
atribuída a alguém.

### Regras de coerência (puras, testadas em `lib/ativos.ts`)

- **Abrir** manutenção → situação vira `manutencao`. **Exceto** se o equipamento
  estiver `descartado`: registrar conserto não pode ressuscitar o que saiu do
  parque.
- **Concluir** → volta para `ativo`, **mas só se ainda estiver em
  `manutencao`**. Se durante o conserto alguém marcou `descartado` (não valeu a
  pena) ou `reserva`, concluir não desfaz essa decisão — só revertemos o que a
  própria manutenção causou.
- **Apagar** manutenção em aberto devolve o equipamento a `ativo`: senão ele
  ficaria preso em "manutenção" sem nenhum registro que explicasse o porquê.
- A situação `manutencao` fica **bloqueada no formulário** do equipamento
  enquanto há conserto aberto — editá-la ali deixaria estado e evento em
  desacordo. Ela volta sozinha ao concluir.

### Garantia: só avisa quando é acionável

`estadoGarantia` devolve `sem | vencida | vencendo | vigente`, com janela de
aviso de **90 dias** — tempo hábil para acionar a assistência antes de acabar.
Garantia vigente não vira badge: alerta que aparece sempre é ruído e deixa de
ser lido.

### Datas ao meio-dia UTC

Datas de aquisição/garantia vêm de `<input type="date"]` como `"2026-08-06"` e
são gravadas como `2026-08-06T12:00:00Z`. Com `00:00Z`, todo Brasil (fuso
negativo) leria **o dia anterior** ao exibir.

### Valores aceitam o formato que o TI digita

`valorCompra` e `custo` aceitam `"3.450,90"` (vírgula decimal) além de número
puro. Recusar o formato brasileiro seria implicância com quem só quer registrar
uma nota fiscal.

### Manutenção ligada ao chamado

`Manutencao.chamadoId` fecha o ciclo **suporte → conserto**: no chamado com
equipamento, o admin manda para manutenção e o registro já nasce vinculado.
`onDelete: SetNull` — a manutenção (e o custo dela) sobrevive ao chamado.

### Reflexo no resto do sistema

Filtro por situação na lista de computadores; badges de situação e de garantia
nos cards; KPIs de **no conserto**, **garantia acabando** e **descartados** no
Dashboard (só aparecem quando há algo a decidir); no Excel, colunas de ciclo de
vida nas abas Inventário e Celulares, bloco "Ciclo de vida dos equipamentos" no
Dashboard e a aba nova **"Manutenções"** com custo total.

---

## 22. Paginação só onde a lista cresce sem teto

**Contexto:** as listas eram carregadas inteiras. Com o sistema em operação, três
tabelas crescem para sempre — `Chamado`, `Manutencao` e `LogAuditoria` — e um ano
de uso vira milhares de linhas numa resposta só.

**Decisão:** paginar **apenas essas três**, com `?pagina=&limite=` (helper puro em
`lib/paginacao.ts`, testado) e botão "carregar mais" no cliente
(`hooks/use-lista-paginada.ts`).

Computadores, celulares, funcionários, salas e tipos **continuam sem paginação, de
propósito**: o teto deles é o tamanho do escritório (dezenas de registros), e a
busca e os filtros dessas telas rodam no cliente sobre a lista completa. Paginá-las
obrigaria a mover filtro e busca para o servidor — mais código, mais chamadas, sem
ganho perceptível.

**Offset e não cursor:** `chamados` ordena por `(status, criadoEm)`, que não é
único nem estável para cursor. Com dezenas de páginas no pior caso, o custo do
`skip` no SQLite é irrelevante, e a regra fica legível.

**Consequência — totais não saem da página:** o rodapé mostra `total` vindo do
servidor, e os KPIs de manutenção (**no conserto**, **custo somado**) passaram a
ser calculados por `count`/`aggregate` sobre o conjunto filtrado inteiro, num campo
`resumo` fora da lista. Somar só a página carregada daria um número errado com cara
de certo. Pelo mesmo motivo, o `total` dos chamados respeita o escopo por papel: se
viesse cru, o operador descobriria quantos chamados existem na empresa olhando o
rodapé.

---

## 23. Filtro na URL e o drill-down do Dashboard

**Contexto:** o Dashboard mostrava números que não levavam a lugar nenhum. "Sem
licença Windows: 7" — quais sete? O analista tinha que ir na lista e conferir na
mão. O impedimento técnico era que os filtros das telas viviam em `useState`:
não havia como linkar para uma lista já filtrada.

**Decisão:** os filtros passam a viver na **query string**
(`hooks/use-filtro-url.ts`). Com isso, todo KPI, barra e card de pendência do
Dashboard vira link para a lista no recorte exato.

- `router.replace` e não `push`: mexer num select não é navegação, e encher o
  histórico faria o botão Voltar percorrer cada mudança de filtro.
- O valor padrão **sai** da URL (`?sala=todos` é ruído num link compartilhado).
- De brinde, o filtro sobrevive ao F5 e vira link que o analista manda ao colega.

**Uma regra, dois consumidores:** as pendências viraram um catálogo único em
`lib/pendencias.ts`, usado pelo Dashboard para **contar** e pela lista para
**filtrar**. Se cada um tivesse a sua regra, o card diria "7" e o clique abriria
6 — e o número perderia a credibilidade. O teste do catálogo verifica exatamente
essa igualdade. Texto salvo em branco conta como ausente: `""` e `null` são a
mesma coisa para quem está conferindo a máquina.

**Card com zero não abre nada:** não há lista para mostrar, e um pop-up vazio
frustra mais do que ajuda.

### 23.1 — Pop-up antes da navegação

O clique num indicador **abre um pop-up** com os registros por trás do número, em
vez de trocar de tela. A pergunta que o painel gera é "quais?", e quase sempre o
analista só quer conferir e voltar — mandá-lo para outra página cobra o preço de
perder o painel e ter que voltar. Quem precisa de fato agir usa o link discreto
no rodapé do pop-up, que leva à tela completa já no mesmo recorte.

As listas são montadas no servidor, junto com os números: a página já carrega
computadores, celulares e chamados para contar, então o detalhe não custa uma ida
nova ao banco. O pop-up mostra até 30 itens e diz quantos ficaram de fora.

**Duas armadilhas da fronteira servidor → cliente que isso revelou:**

1. **Componente de ícone não atravessa.** Passar `Icone={Monitor}` para um Client
   Component quebra com *"Functions cannot be passed directly to Client
   Components"* — um componente é uma função. O card recebe o **nome** do ícone
   e resolve o desenho do próprio lado.
2. **Constante exportada de módulo `"use client"` não atravessa.** O bundler troca
   cada export por uma referência-proxy; `LIMITE_DETALHE` importado de lá chegava
   ao servidor como algo que não era número, e `slice(0, NaN)` devolvia **lista
   vazia com o total certo ao lado** — um bug silencioso, sem erro nenhum. Por
   isso o contrato compartilhado mora em `components/dashboard/tipos.ts`, um
   módulo neutro (sem `"use client"`).

**Filtros novos na lista de computadores** para sustentar os destinos:
`pendencia`, `tipo` (componente) e `garantia`, mais a opção "com funcionário"
(que é o KPI "Computadores em uso").

---

## 24. Supervisor de sala — o mesmo poder, sobre um recorte

**Contexto:** o sistema tinha dois papéis extremos — o TI, que faz tudo, e o
operador, que só abre chamado. Faltava quem responde por uma sala: precisa
enxergar e cuidar do que está nela, sem alcançar o resto da empresa.

**Decisão:** papel `SUPERVISOR`, ligado a **quantas salas precisar** por uma
tabela `SupervisorSala` (e cada sala tem quantos supervisores precisar). O
princípio é: o supervisor não tem "menos permissões que o admin" — tem **as
mesmas permissões sobre um recorte**. Por isso toda regra em `lib/supervisao.ts`
pergunta "isto pertence a alguma sala minha?", nunca "ele pode editar?".

**O que é "da sala":**
- **Computador** — a máquina está na sala **ou** o dono senta nela. Os dois
  lados importam: máquina de estoque guardada na sala não tem dono, e a máquina
  que viajou com a pessoa pode estar com a sala desatualizada. Cobrir só um lado
  deixaria buraco justamente onde o cadastro está torto, que é quando o
  supervisor mais precisa enxergar.
- **Celular** — não tem sala (decisão 15): segue o dono.
- **Funcionário** — senta na sala.
- **Chamado** — é da sala, ou foi aberto por ele mesmo.
- **Manutenção** — pelo equipamento envolvido.

**Escolhas do TI nesta implantação** (decididas por quem opera o sistema):
o supervisor **edita** o cadastro do que é dele e **enxerga o cofre de senhas**
da própria equipe. Consequências assumidas: a auditoria passa a ser a principal
rede de proteção sobre o inventário, e o cofre deixa de ser exclusivo do TI.

**O que continua só com o TI:** cadastrar máquina/pessoa nova (entrada de
patrimônio), remover registros, o catálogo de tipos, o depósito, os usuários, a
auditoria e a exportação em Excel — a planilha sai com o parque inteiro, e
recortá-la é outro trabalho. No helpdesk o supervisor **vê** os chamados da sala,
mas age como operador: não define prioridade, responsável nem andamento, e não
recebe nota interna. A fila de atendimento continua sendo do TI.

**Travas que não são óbvias:**
- **Mover exige origem E destino no escopo.** Sem a trava no destino, o
  supervisor empurraria uma máquina para uma sala que não é dele e deixaria de
  enxergá-la — perdendo o próprio equipamento de vista sem ninguém ter decidido
  isso. Vale também para mover a pessoa, que leva os equipamentos junto.
- **A origem é conferida no banco, não no que a tela mandou.** Confiar no corpo
  da requisição permitiria forjar um id e arrastar equipamento de outra sala.
- **Supervisor sem sala não enxerga nada** — e não tudo. O filtro devolve uma
  condição que não casa com nada, em vez de sumir; um filtro ausente viraria
  "sem restrição", que é o pior default possível. A tela de usuários avisa em
  âmbar quando o supervisor está sem sala.
- **Rebaixar de supervisor limpa os vínculos.** Deixá-los pendurados faria as
  salas antigas voltarem a valer sozinhas se alguém o promovesse de novo meses
  depois.
- **Fora do escopo responde 404, não 403** — mesmo motivo do chamado alheio
  (decisão 20): um 403 confirmaria que aquele patrimônio existe.

**Onde a regra é aplicada:** o filtro entra no `where` do Prisma, para a consulta
já sair recortada do banco. Filtrar depois de ler já teria trazido o parque
inteiro para a memória do processo e, num descuido, para o JSON. O middleware
segue sendo só o portão de navegação: ele não tem banco (roda no Edge) e por isso
não sabe QUAIS registros são de quem — cada rota chama `exigirEscopo` e aplica o
filtro por conta própria.

---

## 25. Rodada de caça a bugs (varredura de 10/08/2026)

Uma varredura do sistema no navegador e na API (guardas de rota, casos-limite de
todas as entidades, XSS, concorrência, papéis) achou oito defeitos. Estão todos
corrigidos, cada um com teste que falha sem a correção. O registro importa mais
pelo **porquê** de cada um ter passado até aqui.

### 25.1 — O papel do supervisor morria no login (o mais grave)

`POST /api/sessao` assinava o cookie com
`usuario.papel === "ADMIN" ? "ADMIN" : "OPERADOR"`, colapsando SUPERVISOR em
operador. Como o `middleware.ts` roda no Edge e julga a navegação **só pelo
cookie**, o supervisor entrava e era devolvido para `/chamados`: nenhuma tela de
inventário abria. O papel funcionava no banco, funcionava em `exigirEscopo` e não
funcionava para quem usava o sistema — a decisão 24 nasceu inalcançável.

**Por que os testes não pegaram:** `tests/api/*` forjam a sessão direto
(`assinarSessao` com o papel desejado) e chamam o route handler. Ninguém passava
pelo login nem pelo middleware, justamente as duas peças que discordavam.

**Correção:** a conversão virou `papelDe()` em `lib/supervisao.ts` — ponto único
de verdade usado pelo login e por `lib/sessao-servidor.ts`. Duas cópias da mesma
regra divergiram; uma não pode. Novos testes: `tests/api/sessao.test.ts` (papel
gravado no cookie, papel por papel) e `tests/api/middleware.test.ts` (o portão de
navegação para os três papéis, tela por tela).

### 25.2 — Data que não existe no calendário

`dataOpcional` validava só o formato `AAAA-MM-DD`. O JS erra de dois jeitos com o
que passa por essa regex:

- `"2026-13-01"` → `Invalid Date` → o Prisma estourava e a rota respondia **500**.
- `"2026-02-31"` → **rola para 03/03** e era gravado calado. Uma garantia passava
  a vencer num dia que ninguém digitou — corrupção silenciosa, o pior dos dois.

**Correção:** `dataDoCalendario()` reconstrói a data em UTC e confere se os três
componentes sobreviveram; se o dia mudou, ele não existia → 400 com mensagem
clara. O `<input type="date">` do Chrome já recusava essas datas, então a tela
nunca esteve exposta — mas a API é porta aberta para script de importação e
outros clientes, e a validação é dela.

### 25.3 — Inativar a própria conta trancava o admin do lado de fora

Havia trava para *remover* a própria conta e para mexer no *último* admin, mas
não para se inativar havendo outro admin: `PATCH {ativo:false}` respondia 200 e a
sessão morria na requisição seguinte (o `ativo` é reconferido no banco). Eram três
cliques sem aviso, e aconteceu de verdade durante a varredura.

**Correção:** quem edita a própria conta não pode se inativar nem se rebaixar
(409 com o motivo). A trava é sobre a pessoa perder o acesso, não sobre o sistema
ficar sem administrador — por isso vale mesmo com outro admin ativo. Editar o
próprio nome/login segue liberado.

### 25.4 — O ajuste ± do depósito não respeitava o teto do estoque

Criar item limitava a quantidade a 1.000.000; o `delta` dos botões ± não tinha
limite nenhum e gravava 1.000.000.000 unidades de um cabo. O piso em 0 existia; o
teto, não. Agora `LIMITE_QUANTIDADE` é exportado de `lib/validations.ts` e vale
para os dois caminhos.

### 25.5 — Login sem freio de força bruta

Doze tentativas erradas seguidas passavam sem atraso. O login protege um cofre de
senhas em texto, então isso não serve. `lib/rate-limit.ts` é um contador em
memória (sem dependência nova): 10 erros por 5 min por **IP + login**, 429 com
`Retry-After`, e acertar a senha limpa o histórico. A chave inclui o login para
que um errante não tranque os colegas atrás do mesmo NAT, e inclui o IP para que
trocar de usuário não zere o freio.

**Limite conhecido:** o contador é por processo. Uma instância única (o container
na LAN) é o caso real; com várias instâncias o teto efetivo viraria N × 10 e isto
precisaria de contador compartilhado.

### 25.6 — CSP entrou (revendo a decisão 9)

A decisão 9 deixou a CSP de fora para não quebrar os estilos inline do
Next/Tailwind. Ela entrou mantendo `'unsafe-inline'` para script e estilo (o Next
injeta os dois; removê-los exigiria nonce por requisição) — ainda assim
`default-src 'self'` barra script, iframe, fonte e conexão de outra origem,
`form-action 'self'` impede que um HTML injetado poste o cofre para fora e
`object-src 'none'` mata plugin legado. O app não usa nenhum recurso externo, então
nada foi restringido do que já existia.

### 25.7 — Mensagens do zod em inglês na tela do TI

Erro de tipo caía no texto embutido do zod: *"Expected string, received number"*,
*"Invalid enum value. Expected 'ativo' | ..."*, *"Required; Required"* — do lado
de "Identificador é obrigatório", em português. `lib/zod-ptbr.ts` instala um error
map global (chamado uma vez por `lib/validations.ts`, que toda rota importa).
Mensagem escrita no schema continua ganhando; só o fallback mudou de idioma.

### 25.8 — Movimentação de sala mentia "ok" para id que não existe

Um lote com id inexistente respondia `200 {ok:true, computadores:1}` e ignorava o
resto em silêncio: quem estava com a tela velha aberta (item removido em outra
aba) lia sucesso onde nada aconteceu. Agora a seleção inteira é conferida antes —
ou move tudo, ou 404 pedindo para atualizar a página. Efeito colateral desejado:
`computadores: 0` passou a significar uma coisa só, "já estavam lá".

### O que a varredura confirmou que está certo

Vale registrar para não virar dúvida depois: guardas de rota (toda página
redireciona, toda API responde 401), ausência de enumeração de usuário no login,
XSS armazenado inofensivo (React escapa; `<img onerror>` e `<script>` renderizam
como texto), injeção SQL sem efeito (Prisma parametrizado), concorrência otimista,
travas do último administrador, 404 em id inexistente, 409 com contagem para
tipo/sala em uso, paginação que não estoura com parâmetro absurdo, exclusão de
funcionário em dois passos (409 → `?liberar=1`) e o Excel com as quatro abas.

### Mobile: ainda sem confirmação visual

A estrutura foi auditada no código e não tem impedimento — o layout empilha em
`md:` e as tabelas rolam dentro do próprio container (`overflow-auto` no wrapper
do shadcn), com a de funcionários precisando de 795px de largura mínima. O que
falta é olho em 390px de verdade (tamanho de fonte, diálogos, alvo de toque: 13
dos 39 alvos ficam abaixo de 36px, incluindo os botões de tema com 26×26 — passam
o mínimo AA de 24px, mas são apertados para dedo). Não deu para medir ao vivo
nesta rodada: o gerenciador de janelas ignora redimensionamento, popup é
bloqueado e iframe é barrado pelo próprio `X-Frame-Options` do app.

---

## 26. Importação de CSV nas sete entidades

Carga em massa por planilha em **funcionários, computadores, celulares, depósito,
tipos, salas e usuários** — `POST /api/importar` + o diálogo único
`components/importar-csv.tsx` nas sete telas. Só administrador.

### Validação não se repete: quem valida é o schema da tela

O ponto que decidiu o desenho: `lib/importacao.ts` **não valida nada**. Cada
entidade converte a linha num objeto e entrega ao MESMO schema zod que o
formulário usa. Consequências que valem o trabalho:

- data inexistente, "1.234,90", e-mail, teto de estoque e limite de texto já
  chegam resolvidos — a decisão 25.2 protege a importação sem uma linha a mais;
- regra nova na tela vale na importação no mesmo commit, sem ninguém lembrar;
- a mensagem de erro que o TI lê na prévia é a mesma da tela.

O que sobra para o `lib/importacao.ts` é o que é só da planilha: sinônimo de
coluna, "Sim/Não" → booleano, "06/08/2026" → ISO, "Administrador" → `ADMIN` e a
resolução de **relação por nome**.

### Relação por nome, porque planilha não tem cuid

A planilha diz "Ana Souza" e "Sala 93", não `cmsh…`. Resolver isso é onde a
importação mais erra, então cada falha é específica: nome que não existe diz qual
nome, e **nome repetido no cadastro é recusado em vez de escolher um** — o banco
tem duas "Ana Souza" de verdade, e adivinhar qual delas ganharia o notebook não
é decisão de software.

### Prévia antes de gravar, e tudo-ou-nada por padrão

Duas fases na mesma rota: `aplicar: false` devolve o plano linha por linha sem
escrever; `aplicar: true` executa numa transação. Se houver qualquer linha com
erro, **nada** é gravado — a menos que o TI marque "importar só as linhas
válidas". Importação é a operação com maior chance de estragar dados em silêncio;
ver o plano antes é o que separa "carreguei a planilha" de "carreguei a planilha
errada em cima do inventário".

A fase de aplicar reprocessa o arquivo do zero em vez de confiar num plano
guardado no servidor: a rota fica sem estado e o que vale é o banco no instante
da escrita.

### Célula vazia NÃO apaga

A regra mais importante para não destruir cadastro: campo em branco numa planilha
quase sempre significa "não sei", não "apague". Célula vazia é **omitida** do
objeto, então reimportar uma planilha com metade das colunas preenchidas não
zera o resto. Limpar um campo continua sendo trabalho da tela (onde `""` → null,
decisão 8). Há teste dedicado a isso.

### O CSV que o Excel brasileiro cospe

`lib/csv.ts` é parser próprio (nenhuma dependência nova) porque o arquivo real
tem: delimitador `;` (a vírgula é decimal em pt-BR), **BOM** UTF-8, CRLF, campo
entre aspas com `;` e quebra de linha dentro, e `""` como aspa literal. O
delimitador é detectado contando fora das aspas **só no cabeçalho** — contar o
arquivo inteiro deixaria um campo de observações cheio de vírgulas vencer o `;`
que separa as colunas. O cabeçalho é normalizado sem acento, então "Patrimônio",
"patrimonio" e "PATRIMÔNIO" são a mesma coluna.

Dois bugs meus que os testes pegaram e que valem registro: **"Não" com acento**
não casava com "nao" (minúscula não é o mesmo que sem acento — daí `semAcentos()`
separado de `normalizarCabecalho()`, que precisa preservar o "-"), e o **BOM do
modelo** não chegava no arquivo. O modelo sai com BOM de propósito: sem ele o
Excel abre em ANSI e "Memória" vira "MemÃ³ria".

O arquivo é lido no navegador tentando **UTF-8 estrito** e caindo para
**Windows-1252** se não for válido — planilha salva como CSV no Windows costuma
sair em 1252, e decodificar isso como UTF-8 estraga todo acento.

### Chave natural, e o que "atualizar" significa

Casar linha com registro usa a chave natural: `identificador` (computador,
celular), `login` (usuário), `nome` (tipo, sala, funcionário, item de depósito).
Onde o banco garante unicidade, atualizar é seguro. Em **funcionário e item de
depósito não existe unique**, e aí o casamento por nome só acontece quando há
**exatamente um** registro com aquele nome; havendo dois, a linha é recusada.
Chave repetida dentro do próprio arquivo também é erro, apontando a linha
anterior — sem isso a segunda linha sobrescreveria a primeira em silêncio.

### Usuários: senha e as travas que já existiam

Senha vinda da planilha (ou **sorteada**, quando a coluna vem vazia) nasce
provisória, e a sorteada é devolvida **uma única vez** na resposta para o TI
distribuir. O hash é calculado ANTES da transação: scrypt é caro de propósito e
prender a transação do SQLite durante N hashes travaria o resto do app.

A importação não é porta dos fundos para o que a tela impede: a linha da
**própria conta de quem importa** é recusada (decisão 25.3). Não existe checagem
de "ficaria sem administrador" porque ela seria inalcançável — quem importa é um
admin ativo, a própria linha já foi recusada e a importação nunca remove ninguém;
código que teste nenhum consegue exercitar é pior que nenhum código.

### Limites e auditoria

2 MB de texto e 1000 linhas por importação, para uma planilha gigante não prender
o processo numa transação só. A auditoria recebe **um evento por importação** com
as contagens, não um por linha — mesma escolha da contagem ± do depósito
(decisão 17): o histórico serve para saber que houve uma carga, e os registros em
si já aparecem na entidade.

### O que ficou de fora

Componentes de hardware não têm importação: cada linha precisaria apontar
computador **e** tipo, e o caminho natural é importar as máquinas e depois usar a
tela. Chamados e manutenções também não — são eventos, não cadastro.

---

## 27. Papel de cobrança e a porta do `/chat`

**Contexto:** a Cobratec é uma empresa de cobrança, e o atendimento ao devedor
por WhatsApp vai passar a acontecer dentro deste sistema — com o dossiê da
carteira (vindo do Siscobra, o CRM) ao lado da conversa. Isso traz para dentro
do app um **segundo ofício**, que não é o TI, e uma classe de dado que o
inventário nunca teve: dado pessoal de terceiro (CPF, dívida, negociação).

**Decisão:** papel `COBRANCA`, separado, com destino próprio (`/chat`). Esta
rodada entrega o **papel inteiro** — schema, API, tela de usuários, importação,
middleware, navegação e testes — e a tela do chat como **fase 0**: o portão e o
lugar existem, o serviço de conversas ainda não.

### Papel novo, e não operador com uma flag

A pergunta "quem pode ler conversa com devedor?" é de outra natureza que "quem
pode abrir chamado". Se cobrança fosse `OPERADOR` + flag, todo operador de
helpdesk herdaria a porta do dado pessoal no dia em que o `/chat` subisse — a
falha teria a forma de um `if` esquecido, não de uma decisão. Papel separado
torna o alcance uma escolha explícita em três lugares que se espelham:
`exigirChat` (API), `PERMITIDO_COBRANCA` (middleware) e `podeChat` (navegação).

### O supervisor de sala fica de fora

Deliberado, e é o ponto mais fácil de errar: o supervisor tem **as mesmas
permissões sobre um recorte** (decisão 24), então a tentação é dar a ele a
conversa da "sua" sala. Não. Cobrança não é assunto de sala — o alcance sobre
dado pessoal de devedor se decide pelo **ofício** da pessoa, nunca pelo lugar
onde ela senta. Por isso nada em `lib/supervisao.ts` se ramifica para `COBRANCA`:
lá ela cai exatamente onde o operador cai (só os próprios chamados), e o alcance
extra dela vive fora, em `exigirChat`.

O caminho inverso também vale: cobrança **não enxerga inventário**, nem o
dashboard. Ela entra no sistema para atender, e leva junto só o que o operador
tem (abrir chamado para o TI, trocar a própria senha) porque também é
funcionária da casa.

### A lista de papéis passou a ser importada, não repetida

`lib/sessao.ts` validava o papel do cookie contra uma lista literal. Acrescentar
`COBRANCA` sem tocar nesse arquivo faria o cookie ser **recusado na leitura**: a
pessoa logaria e cairia fora na página seguinte, sem erro nenhum que explicasse
por quê — o parente próximo do bug 25.1, que nasceu exatamente de duas cópias da
mesma lista discordando. Agora `PAPEIS` vem de `lib/supervisao.ts` e o compilador
cobra o resto. Papel novo se acrescenta em um lugar só.

### `siscobraUsucod`: um número solto, de propósito

Para atribuir uma conversa a quem de fato trabalhou o caso (e medir conversão) é
preciso o `usuario.usucod` da operadora no Siscobra — as regras de atribuição de
lá (acionamento, acordo) são todas por esse código.

Ele é `Int?` e **não** relação porque o Siscobra é outro banco, PostgreSQL e
**somente leitura**: guardar o código solto é o único vínculo possível. A
consequência assumida é que ele pode apontar para um operador que não existe mais
lá, e quem consome trata o vazio — melhor isso do que o SQLite prometer uma
integridade que não tem como cumprir.

**O código anda colado ao papel**, nos dois sentidos e nos três caminhos de
escrita (POST, PATCH e importação): só é gravado para `COBRANCA`, e sair do papel
o zera. Mesma razão dos vínculos de sala do supervisor — um código pendurado num
papel que não atende devedor é uma atribuição que ninguém usa e que **voltaria a
valer sozinha** no dia em que o papel mudasse de novo.

Na importação isso significa três regras: código com papel errado **erra a
linha** (é engano de planilha, e avisar é melhor que ignorar calado), rebaixar
por planilha **solta** o código, e célula vazia de quem continua na cobrança
**não apaga** o que está gravado (decisão 26). O valor vai como texto cru para o
`usuarioSchema`, que agora coage — a conversão de célula não se repete fora do
schema, e `null` continua distinguível de zero porque o `.nullable()` corta antes
da coerção.

### Conversas não é item de menu

No desktop o `/chat` é um bloco destacado logo acima do perfil, não uma linha na
lista; no mobile, o primeiro item da barra. A lista de navegação é o inventário —
e para quem atende cobrança o chat não é "mais uma tela", é a única porta que
importa. Ela precisa cair nela sem procurar.

### Fase 0: a tela existe antes do serviço

`/chat` hoje explica que o serviço ainda não está conectado e o que virá. Foi
escolha, não sobra de trabalho: sem ela o middleware mandaria a operadora de
cobrança para uma rota inexistente no primeiro login. O portão real continua
sendo `exigirChat` em cada rota de `/api/chat` — a checagem na página é só
navegação, no mesmo espírito das outras telas.

**O que falta para a fase 1:** ligar o número de WhatsApp, subir o serviço de
conversas, a leitura somente-leitura do Siscobra para o dossiê e as regras de
negociação por carteira. Nada disso muda o desenho do papel — que é justamente o
motivo de ele ter sido fechado primeiro.

---

## 28. O chatbot de cobrança: quem faz o quê

**Contexto:** a decisão 27 entregou o papel `COBRANCA` e a porta (`/chat`) sem o
serviço atrás dela. Esta decisão liga o serviço — um chatbot de WhatsApp que
atende o devedor, consulta o Siscobra e passa para a operadora quando precisa.

**Decisão:** três peças com fronteiras rígidas.

| Peça | Responsabilidade | Não faz |
|---|---|---|
| **WAHA** (Docker, LAN) | ser o canal do WhatsApp | não decide nada |
| **n8n** (já em uso) | **é o chatbot**: classifica, consulta o Siscobra, redige, decide escalar | não guarda o atendimento |
| **Inventário** (este app) | registro do atendimento + tela da operadora | **não fala com o Siscobra nem com o WhatsApp** |

### O inventário não abre conexão com o Siscobra

Foi a escolha estrutural da rodada, e a mais fácil de fazer errado — a tentação
era óbvia: já existe schema mapeado e SQL validado no projeto irmão, bastava um
`pg` no `package.json` e uma rota `/api/chat/.../dossie`.

Não. O que isso custaria: uma segunda conexão de banco num app que hoje é um
arquivo SQLite, credencial do CRM guardada aqui, pool aberto contra um Postgres
de produção que não é nosso, e uma dependência nova na única aplicação que o TI
precisa conseguir subir sozinha. O n8n **já** tem a credencial, já é o dono da
integração, e passa por lá de qualquer forma para atender o devedor.

Então o dossiê chega **empurrado**, como snapshot em JSON (`Conversa.dossie`,
mesmo padrão de `Componente.especificacoes`). Efeito colateral que virou
qualidade: congelado tem valor próprio — é o que a operadora tinha à frente
quando negociou, e não o que o CRM diz hoje. Em cobrança essa diferença é a
resposta de uma contestação.

O mesmo raciocínio vale para o envio: o app chama um webhook do n8n
(`CHAT_ENVIO_URL`), não o gateway. Trocar WAHA por WPPConnect amanhã é mexer no
fluxo do n8n — sem migration, sem deploy, sem tocar em código de autenticação.

### Evolution API estava de pé e ficou de fora

Havia um bot funcionando (`Cobratec/evolution_api`: Evolution + Flask + Ollama,
com histórico próprio em SQLite). A escolha do TI foi começar do zero com n8n. O
que se ganha: o fluxo passa a ser editável por quem não programa, e a
orquestração deixa de morar num arquivo Python que só uma pessoa mexe. O que se
perde, e vale registrar: aquele projeto já tinha o **padrão de 2 chamadas**
desenhado (classificar → responder) e a regra de ouro do domínio escrita. As
duas coisas foram trazidas para cá em vez de redescobertas —
`docs/conversas/prompts.md` é herdeiro direto daquele `SYSTEM_PROMPT`.

**Gateway:** WAHA com motor **NOWEB** (Baileys, sem navegador), porque a máquina
já roda Supabase, Postgres e o inventário — um Chromium headless por sessão
custaria centenas de MB para nada. Alternativa registrada: WPPConnect (Apache
2.0). **Risco assumido e dito em voz alta:** todo gateway não-oficial contraria
os termos do WhatsApp e pode levar ao banimento do número. Chip dedicado, nunca
a linha principal.

### A trava do domínio é código, não prompt

A regra: **nenhum valor sai antes de o devedor provar quem é** (CPF **e** data de
nascimento — a dupla verificação anti-enumeração que o "Negocie Online" já usa).

Ela vive em `lib/conversas.ts` (`podeRevelarValores`, `propostaCabeNaRegra`), não
no prompt, e a diferença não é estilo: prompt é sugestão, e um modelo que alucina
não consulta o prompt antes de responder. O fluxo do n8n só injeta saldo no
contexto do redator quando a conversa está identificada — o modelo não pode dizer
um número que nunca recebeu.

`identificadaEm` existe separado de `siscobraDevcod` exatamente por isso: o n8n
também faz um **palpite** por telefone (para a saudação), e palpite preenche o
código sem preencher a data. Só os dois juntos liberam valor. Um campo só teria
transformado "achamos que é a Maria" em "pode falar o saldo da Maria".

A segunda trava é a **regra oficial da carteira** (`acordo_regras` /
`acordo_regras_parcela`): o robô só fecha dentro do que está cadastrado, e
carteira **sem** regra ativa não negocia — escala. Como só ~20 carteiras têm
regra ativa, o caminho comum é a operadora, o que é o correto: sem documento
oficial, quem inventa condição é gente que responde por ela.

### Entregar primeiro, gravar depois

A ordem no envio da resposta da operadora é deliberada e vale contra o instinto
de "grava e tenta mandar":

- **gravar antes** produz a tela mostrando uma resposta que o devedor nunca
  recebeu. A operadora segue em frente e ninguém descobre até a cobrança azedar;
- **entregar antes** produz, no pior caso, mensagem duplicada quando a resposta
  do gateway se perde.

Mensagem repetida é constrangimento. Mensagem fantasma é uma promessa que a
empresa não sabe que fez. Escolhemos o constrangimento — e a tela diz, em toast
que não some sozinho, quando o envio falhou.

### A situação só anda para frente

`bot → fila → humana → encerrada`, e **de humana não se volta para bot**.
Devolver ao robô uma conversa em que a atendente acabou de prometer algo é a
receita para a máquina contradizê-la na frente do devedor. Voltar ao robô exige
encerrar e o devedor escrever de novo — aí é outro atendimento, e o webhook
reabre sozinho.

Pelo mesmo motivo, o webhook **nunca** tira uma conversa de quem assumiu: o robô
pedindo escalonamento numa conversa já `humana` não mexe em nada.

### Idempotência mora no banco

`ConversaMensagem.waId` é `UNIQUE`, e a violação é tratada como **sucesso** na
rota. Webhook reentrega — é o comportamento normal de qualquer gateway —, e sem
essa trava a fala do devedor apareceria duas vezes no histórico. Um "já existe?"
em código não bastaria: dois webhooks simultâneos passariam pelos dois lados do
`if`. E responder erro faria o n8n tentar para sempre.

### O n8n não é um usuário

`exigirServico` (token estático, comparado em tempo constante) em vez de um
`Usuario` com papel COBRANCA para o robô. Um usuário-robô apareceria na fila,
poderia assumir conversa e teria senha no cofre. O n8n não é uma atendente — é o
canal.

O webhook é a única rota "pública" no middleware junto com login e healthcheck,
e a liberação é por **caminho exato**: `startsWith("/api/chat")` abriria a fila e
o dossiê inteiros para quem não tem cookie nenhum. Há teste para os dois lados.

### Sem token configurado, 503 e não 401

Falta de configuração se anuncia. Um 401 mandaria o TI caçar credencial errada
por horas quando o problema é uma variável em branco — mesmo espírito do
`AUTH_SECRET` obrigatório (decisão 19).

### O que ficou de fora, e por quê

- **Mídia** (áudio, foto, boleto): só texto. Áudio é o próximo pedido óbvio e
  precisa de transcrição no n8n antes de virar coluna aqui.
- **Realtime**: a fila recarrega a cada 15s. Para dezenas de conversas serve;
  SSE entra quando incomodar, não antes.
- **Escrever no Siscobra** (virar ocorrência em `retorno`): a conexão é somente
  leitura por decisão do TI, e escrever no CRM de produção é decisão que não se
  toma de passagem.
- **Horário legal de atendimento**: cobrança tem restrição de horário e o robô
  hoje responde a qualquer hora. Fica no fluxo do n8n até virar regra de negócio
  de verdade.

---

## 29. Modo direto: WhatsApp sem n8n, para testar

**Contexto:** a decisão 28 deixou o desenho pronto e nada ligado. Para ver a
primeira mensagem entrar era preciso, antes: subir o gateway, parear um número,
montar dois fluxos de n8n, criar a credencial do Siscobra e escrever os prompts.
Cinco peças, e um erro em qualquer uma aparece como "não funcionou" — sem dizer
onde. O pedido era outro e menor: **conectar no WhatsApp para testar**, sem
Twilio e sem API oficial da Meta.

**Decisão:** um segundo caminho, ligado por variável de ambiente, em que o
inventário fala com o gateway diretamente:

```
produção (28)   WhatsApp → WAHA → n8n (o chatbot) → inventário
teste    (29)   WhatsApp → WAHA ────────────────→ inventário
```

Liga com `WAHA_URL` no `.env`; sem ela, nada deste caminho existe. Pareamento em
**/chat → Conexão** (só admin): botão, QR na tela, celular lê, pronto.

### A fronteira da decisão 28 continua de pé

O que aquela decisão protege não é "o app não fala com gateway" — é **onde mora
a integração**. E o que ela protege de verdade continua intacto: o inventário
segue **sem conexão com o Siscobra**, o dossiê segue chegando empurrado, e o
caminho de produção segue sendo o do n8n. O que o modo direto encurta é só o
trecho do canal, e só quando alguém pede.

**`CHAT_ENVIO_URL` (n8n) tem precedência.** Com os dois configurados, o n8n
manda. Se fosse o contrário, uma variável esquecida no `.env` silenciaria o
chatbot inteiro — e ninguém perceberia até o devedor reclamar que ninguém
respondeu.

### Sem robô, a mensagem vai para a fila

No modo direto não há nada do outro lado: toda mensagem que chega entra
**escalada** (`motivoEscalonamento: "sem robô ligado (modo direto)"`), e a
conversa cai em `fila`. Parar em `bot` — o padrão do webhook do n8n — deixaria o
devedor esperando um atendimento automático que ninguém ligou.

Isso reaproveita a máquina de estados existente em vez de criar uma paralela, e
foi o motivo de extrair `registrarEntrada` (`lib/chat-registro.ts`): as duas
portas de webhook precisam da **mesma** regra de conversa criada sem corrida,
encerrada que reabre, reentrega que não duplica e robô que não rouba o que já
está com gente. Duas cópias divergiriam no pior momento.

### Um segredo só, um portão só

O webhook do gateway usa o **mesmo** `exigirServico` e o **mesmo**
`CHAT_SERVICE_TOKEN` do webhook do n8n. Isso é possível porque o WAHA aceita
`customHeaders` por sessão — e a sessão é criada **pelo próprio app**, no botão
"Conectar", já com o `Authorization: Bearer`. Foi verificado contra o container:
a variável de ambiente `WHATSAPP_HOOK_URL` do compose não suporta cabeçalho
nenhum, e por isso ela fica **vazia** no modo direto.

Consequência prática: conectar sem `CHAT_SERVICE_TOKEN` é recusado com 503. Uma
conexão que recebe mensagem e a joga fora em 401 é pior que uma que não sobe.

### O eco

A resposta da operadora sai por este mesmo gateway e voltaria como evento. Por
isso a sessão do modo direto assina só `message` (não `message.any`), e mesmo
assim o parser descarta `fromMe`. Duas travas para o mesmo defeito porque ele é
invisível na revisão e óbvio na tela: a mesma fala duas vezes na thread.

Também não viram conversa: **grupo** (cobrar dívida na frente de terceiro é
exposição de dado pessoal, e não há como saber quem está no grupo), broadcast e
mensagem sem texto — o modelo só guarda texto, como na decisão 28. Tudo isso
responde **200 "ignorado"**: recusar faria o gateway reentregar para sempre algo
que nunca seria aceito.

### Quem se pendura na rede de quem

Os dois containers se falam pelo **nome**, na mesma rede Docker, e é o **gateway
que entra na rede do inventário**. A direção não é arbitrária: o inventário é o
sistema do TI e precisa subir sozinho, sem saber que existe WhatsApp — a stack
opcional é que depende da principal.

O primeiro desenho errou nisso. O gateway publicava só em `127.0.0.1:3001` (para
não expor o número da empresa na rede, o que continua certo) e o app tentava
alcançá-lo por `host.docker.internal` — que resolve para o IP da ponte do
Docker, onde o loopback do host **não escuta**. Resultado: `connection refused`,
com as duas pontas no ar e configuradas. A porta publicada continua existindo,
mas agora com o papel certo: é para **gente** (painel do WAHA, diagnóstico) e
para o caso de o inventário rodar fora do Docker.

### O QR passa pelo app

A imagem vem por `/api/chat/conexao/qr`, e não do gateway direto no `<img>`: a
chave da API é segredo de servidor, o gateway só escuta na LAN, e a CSP
(`img-src 'self'`, decisão 25) barraria outra origem. A rota é `no-store` — QR é
credencial de pareamento com validade de segundos.

**Quem pareia é o admin**, não a operadora de cobrança: ela usa a linha o dia
inteiro, mas derrubar a conexão da equipe não é ação dela. Mesma divisão de
`/usuarios` e do catálogo.

### O risco, de novo

WAHA se conecta como "aparelho conectado" do WhatsApp Web. Isso contraria os
termos do WhatsApp e **o número pode ser banido** — em cobrança, perder a linha
é prejuízo operacional. Chip dedicado, nunca a principal. Quando o volume
justificar o custo por conversa, o caminho é a API oficial da Meta; o app não
muda, porque quem conhece o canal é o gateway (ou o n8n).

---

## 30. Anexo do devedor e fila ao vivo

**Contexto:** com o número pareado, o primeiro teste real mostrou dois buracos
que só aparecem com gente de verdade do outro lado. Um foi diagnóstico, e é o
mais importante da rodada.

### O defeito de fundo era o silêncio

A mensagem não apareceu na fila. O gateway dizia ter entregado, o app respondia
**200**, e não havia rastro nenhum de onde ela morreu — o filtro descartava sem
dizer nada. Um `if` que joga fora em silêncio transforma qualquer defeito numa
caça sem pista.

Agora todo evento ignorado grava uma linha com o motivo. Ela **não leva conteúdo
nem número** (LGPD — log de servidor não é lugar de mensagem de devedor): só o
tipo do evento, o domínio do endereço e os sinalizadores. É o suficiente para
responder "por que isto não apareceu?" e nada além disso.

### Mídia entra, mesmo sem o arquivo

Antes, mensagem sem texto era descartada — quem mandava um áudio simplesmente
não existia para quem atende. Agora vira mensagem com marcador (`[áudio]`,
`[imagem] segue o comprovante`) e o anexo é baixado do gateway em seguida.

A ordem importa e é a mesma regra da decisão 28: **a fala é gravada primeiro, o
anexo depois**, e a falha do download é engolida. O pior caso vira "a operadora
vê `[áudio]` e não consegue ouvir" — nunca "a conversa sumiu porque um download
falhou".

O arquivo fica **fora do banco**, ao lado do `dev.db`, no mesmo volume: SQLite
com blob de áudio vira um arquivo de gigabytes que o backup copia inteiro toda
noite. E o nome do arquivo é derivado do id da mensagem (hash), nunca do nome que
veio do WhatsApp — nome de arquivo de terceiro é entrada não confiável, e
`../../dev.db` gravaria fora da pasta. Servir passa pelo **mesmo portão da
conversa** (`exigirChat`), com a mensagem buscada amarrada ao id da conversa da
URL: sem isso, um id de mensagem de outra conversa serviria por qualquer rota.

Também vale o cuidado com o endereço do download: a URL vem do webhook, e só a
**origem do gateway** é aceita. Buscar de um endereço arbitrário que chegou de
fora seria pedir para o servidor varrer a rede interna (SSRF).

### O endereço do remetente pode não ser telefone

O WhatsApp está migrando para **LID** (`1234567@lid`), um identificador que não é
número. Como `Conversa.telefone` é a identidade (UNIQUE), gravar um LID ali
criaria uma segunda conversa da mesma pessoa e quebraria o envio da resposta.
O número passa a ser procurado nos campos vizinhos; **não havendo nenhum, a
mensagem é ignorada e o motivo vai para o log** — chutar seria pior.

### Fila ao vivo: SSE e um barramento de processo

A fila recarregava a cada 15s. Pouco no relógio, muito na prática: quem atende
deixa a aba num monitor lateral, e um devedor esperando quinze segundos sem nada
piscando é um devedor que ninguém viu.

**SSE, não WebSocket:** o fluxo é de mão única (servidor → tela), e SSE é HTTP
puro — passa pelo mesmo cookie, pela mesma CSP (`connect-src 'self'`) e pelo
mesmo middleware, sem servidor separado nem biblioteca nova.

**Barramento em memória, não Redis:** mesmo espírito do SQLite deste projeto. O
limite fica dito no arquivo: só funciona com **um processo**. Com duas
instâncias, o aviso nasce numa e a tela está pendurada na outra — e o conserto
será trocar `lib/chat-eventos.ts` por um canal de verdade, sem tocar na tela.

Por isso **a consulta periódica não foi removida**, só afrouxada para 60s quando
o canal está vivo. Se o canal cair, o pior caso volta a ser "a fila demora um
pouco", nunca "a fila congelou e ninguém percebeu". A tela diz qual dos dois
está valendo, porque para quem atende "está quieto" e "parou de atualizar" não
podem ser a mesma coisa.

O que se protege com teste, e é o que só apareceria depois de dias no ar:
ouvinte que sobrevive à aba fechada (vazamento clássico de SSE) e ouvinte
quebrado derrubando a gravação que o originou.

## 31. Um robô local que só sabe triar

**Contexto:** o modo direto (decisão 29) conectou o número, mas deixou o
atendimento inteiro na mão de gente — "oi" chega na fila do mesmo jeito que
"quero negociar". Do outro lado, o chatbot da decisão 28 depende de n8n de pé,
credencial do Siscobra e prompts revisados. Entre não ter robô nenhum e ter o
desenho completo cabia um passo: um modelo **local** fazendo o que não precisa
de dado — receber bem e passar para gente.

### Local, e não uma API na nuvem

A conversa aqui é com devedor: nome, telefone, o que ele deve, o que ele alega.
Mandar isso para uma API de terceiro para redigir um "olá" é exportar dado
pessoal de gente que não faz negócio com o terceiro. O Ollama roda na própria
máquina, e **nenhuma conversa sai da empresa** — o que também dispensa chave,
fatura e um contrato de tratamento de dados que ninguém quer assinar por causa
de uma saudação.

O custo dessa escolha é o tamanho do modelo: cabe um 1B–3B em CPU, não um
modelo de fronteira. E é daí que vem o resto desta decisão.

### O que se aprendeu medindo (e inverteu o desenho)

O plano inicial era o óbvio — mandar tudo ao modelo e confiar no prompt para
ele escalar o que fosse grave. O teste com `llama3.2:1b` derrubou isso em quatro
medições:

- "já paguei mês passado" → **"Não, ainda não"**. O modelo *negou um pagamento*
  sem ter nenhum dado. Em cobrança isso não é gafe, é o art. 42 do CDC.
- "vou chamar meu advogado" → o modelo **inventou um telefone** na resposta.
- "bom dia, tudo bem?" → respondeu **"O que dizer"**, o rótulo do campo JSON.
  Modelo pequeno copia o formulário em vez de preenchê-lo.
- "vocês atendem sábado?" → **"Não, não atendemos sábados"**, inventado. Fato
  sobre a empresa também é dado que ele não tem.

Nenhum desses é problema de prompt: é o tamanho do modelo. Então a ordem se
inverteu. **O código decide o que é perigoso; o modelo só é consultado no que
sobra.** `assuntoExigeGente` (em `lib/chat-bot.ts`) é a trava de entrada —
dívida, pagamento, menção jurídica, dado pessoal, contestação e pergunta
operacional vão para a fila **sem passar pelo modelo**. De quebra ficou mais
rápido: o caso grave não paga inferência.

O que sobra para o robô é pequeno de propósito: saudação, "quem é você", "como
funciona". É uma recepcionista, não uma negociadora.

### Prompt orienta; código impede

A decisão 28 já dizia que a trava do domínio é código e não prompt. Aqui isso
fica literal: o prompt pede para não falar de valor **e** `avaliarResposta`
confere o texto pronto antes de ele sair. Um modelo que alucina não relê o
prompt antes de responder.

A conferência é sobre o **texto final**, não sobre a intenção declarada — o
modelo pode dizer `escalar: false` e ter inventado um número no meio da frase, e
é exatamente esse caso que precisa ser barrado. Barram a saída: cheiro de valor
(`R$`, `10%`, `3x`, "desconto", "parcelar", "boleto", "pix"), telefone, promessa
de atendente sem escalar de verdade, eco do rótulo do formulário, texto vazio e
texto longo demais.

Uma regra merece nome próprio: **campo `escalar` ausente escala**. Tratar
ausência como `false` faria a decisão mais perigosa — falar com o devedor — ser
justamente a que acontece quando o modelo entendeu menos. Na dúvida sobre o que
o modelo quis dizer, quem atende é gente.

E toda saída que não é "respondeu" termina em **escalar, nunca em silêncio**:
modelo fora do ar, estouro de tempo, formato quebrado, valor inventado e falha
de entrega caem todos no mesmo lugar — a conversa na fila, com o motivo escrito.
Um devedor esperando um robô que travou é o defeito que ninguém vê acontecer.

### A ordem: grava, pisca a fila, e só então fala

O robô é a **última** coisa do webhook. A mensagem é gravada, a fila ao vivo
pisca (decisão 30), e só aí ele pensa. Assim, se ele demorar, travar ou dizer
bobagem, o devedor já está visível para quem atende — o atendimento nunca fica
pendurado na saúde do modelo.

Ele também não fala em conversa que não é dele: só age quando a `situacao` do
registro é `bot`, e `escalarConversa` usa `updateMany` filtrando por
`situacao: "bot"` em vez de `update` pelo id. É a trava da decisão 28 em forma de
consulta — se uma operadora assumiu entre a mensagem chegar e o robô desistir, a
linha não é tocada. **O robô nunca tira uma conversa de quem já está atendendo.**

Reentrega do gateway também não vira fala dobrada: mensagem duplicada é detectada
pelo `waId` UNIQUE e o robô não é chamado de novo.

### O prompt é curto por medida, não por gosto

Rodando local em CPU, **ler** o prompt custa mais que escrever a resposta: numa
máquina sob pressão de memória, 390 tokens de sistema levaram 235s dos 263s de
uma resposta inteira. Cada frase do prompt é paga em segundos de espera do
devedor, a cada mensagem. Encurtar não afrouxou nada, porque quem segura o robô
é `avaliarResposta`.

Na mesma linha: `temperature: 0` (em cobrança não se quer criatividade),
`num_predict: 120` (2 frases cabem folgadas, e resposta longa sem dado é resposta
que inventa), `format: "json"` (é o que faz modelo pequeno devolver JSON de
verdade), `keep_alive: "30m"` (sem isso, uma pausa de minutos paga a carga do
modelo de novo) e teto de 45s.

### Como liga, e quem tem precedência

Só `OLLAMA_URL` no `.env`. **Vazio = sem robô**, e tudo continua caindo na fila
como na decisão 29 — o comportamento anterior é o padrão, não uma opção. O n8n
(`CHAT_ENVIO_URL`) continua com precedência sobre o modo direto: uma variável
esquecida não pode silenciar o chatbot inteiro.

O Ollama roda no **host**, não em container: do app conteinerizado o endereço é
`host.docker.internal:11434`, e ele precisa escutar fora do loopback
(`OLLAMA_HOST=0.0.0.0 ollama serve`).

### O que este robô não é

Não fala com o Siscobra, não conhece saldo, contrato nem regra de carteira — a
fronteira da decisão 28 está intacta. Ele é o degrau entre "ninguém responde
fora do horário" e o chatbot completo, e continua valendo o risco dito em voz
alta na decisão 29: gateway não-oficial contraria os termos do WhatsApp, chip
dedicado.

### Um defeito achado de brinde: o `.env` entrando no teste

A suíte quebrou em duas asserções de "cai na fila" — na máquina de quem tinha
`OLLAMA_URL` ligado. O `@prisma/client` carrega o `.env` do projeto ao ser
importado, então o ambiente do desenvolvedor entrava no processo de teste. Na
CI, que não tem `.env`, passava. Teste que muda de resultado conforme a máquina
não protege nada: o `beforeEach` de `tests/api/chat-waha.test.ts` passa a apagar
a variável explicitamente, como já fazia com `CHAT_ENVIO_URL`.

Testes: 490 → **534**.

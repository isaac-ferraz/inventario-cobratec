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

### 31.1 — O modelo no Colab, e por que ele não vira produção

**Contexto:** a máquina que roda o inventário é a mesma que roda o modelo, e ela
é apertada — foi ela que produziu os 263s de uma resposta sob pressão de
memória. O Colab dá uma GPU T4 de graça, e um 3B nela responde em menos de um
segundo. A tentação é óbvia.

O notebook está em [`conversas/colab/`](./conversas/colab/ollama-colab.ipynb) e
faz o caminho inteiro: sobe o Ollama com GPU, **mede** as falas típicas contra o
teto de 45s do webhook, abre um túnel e imprime as três linhas prontas para o
`.env`.

**E ele é de teste, de propósito.** A decisão 31 escolheu rodar local por um
motivo que não muda com a velocidade: a fala do devedor não sai da empresa.
Apontar `OLLAMA_URL` para um túnel manda a mensagem para uma VM do Google — o
mesmo tratamento de dado pessoal de terceiro que a decisão recusou. Some a isso
o que o Colab é: sessão que cai em ~90 min ociosa, teto de ~12h, endereço novo a
cada execução e nenhuma promessa de servir tráfego. Nada disso é defeito do
notebook; é o que ele é.

Então o desenho não tenta impedir — tenta **não deixar a escolha invisível**:

- `ehLocal()` decide se o endereço é alcançável da internet, e a tela
  `/chat → Conexão` **avisa em vermelho** quando o modelo está fora da rede. A
  versão anterior do card dizia "rodando nesta rede" em texto fixo — que viraria
  mentira no primeiro `.env` apontado para o Colab, exatamente o defeito que a
  decisão 31 tinha acabado de corrigir na frase vizinha.
- Na dúvida, `ehLocal` responde "fora": URL que nem parseia não é chamada de
  segura, e um IP público da própria empresa conta como fora — quem expôs o
  Ollama na internet tomou a mesma decisão de quem usa o Colab.

**A porta que o Ollama deixa aberta.** Ele não tem autenticação nenhuma; na LAN
isso passa, num túnel público seria um modelo aberto para quem achasse o
endereço — e endereço não é segredo. Por isso quem atende o túnel é um proxy de
vinte linhas que exige `Bearer` (`OLLAMA_TOKEN`, novo) e libera **duas rotas**:
conversar e listar modelos. Lista de permissão, não de bloqueio — rota nova do
Ollama nasce fechada, e um `DELETE /api/delete` vindo da internet não apaga o
modelo no meio do atendimento. Proxy recusando o token é falha como outra
qualquer: **escala**, não silencia.

Essa trava tem teste, e ele roda **à mão** (`docs/conversas/colab/testa-proxy.py`):
o código sob teste mora num `.ipynb`, onde o vitest não chega. O script extrai a
célula do proxy do próprio notebook e a executa contra um Ollama de mentira —
testar uma cópia colada seria testar algo que envelhece em silêncio enquanto o
notebook muda.

**O que o notebook mede, e por que isso importa mais que a velocidade.** A
pendência aberta na decisão 31 era saber se o modelo pequeno consegue triar o
pouco que sobrou para ele. A célula de medição roda as falas típicas e compara
com o teto de 45s — porque resposta acima do teto é conversa que a operadora vai
atender de qualquer jeito, só que depois de a pessoa esperar. Se o 3B com GPU
não triar visivelmente melhor que o 1B local, a resposta certa é ficar com o
1B: a dependência de um túnel não se paga.

Testes: 534 → **552**.

**Emenda (13/08/2026) — o endereço parou de mudar.** O atrito real deste caminho
não era a GPU nem o túnel: era o `.env`. Cada sessão do Colab sorteava endereço
novo (`trycloudflare` é o modo *sem conta*, e sorteia justamente por isso) e
token novo (`secrets.token_urlsafe`, na própria célula) — três linhas trocadas no
`.env` e um `docker compose up -d`, toda vez.

**O sentido se inverteu: o notebook parou de inventar o par e passou a recebê-lo.**
`OLLAMA_TOKEN`, `NGROK_TOKEN` e `NGROK_URL` saem do cofre de Secrets do Colab, e
o túnel virou ngrok com um domínio reservado da conta (o plano grátis dá um). O
`.env` é escrito uma vez.

As duas pontas mudam **juntas**, e essa é a parte que importa: endereço fixo com
token sorteado dá 401 no inventário sem nada aparentemente errado à vista. Por
isso o "FIXO" que a célula imprime exige que **as duas** tenham vindo do cofre —
não basta o endereço bater.

Faltando qualquer Secret, a célula **avisa e cai** no túnel sorteado do
Cloudflare: o comportamento antigo vira rede de segurança, em vez de o notebook
parar de funcionar por falta de cadastro.

Nada disso mexe na fronteira. O modelo continua fora da rede, `ehLocal()`
continua respondendo "fora" para o domínio do ngrok e a tela continua vermelha.
Endereço fixo torna o caminho de teste **cômodo**, não o promove a produção.

**O que quebrou junto, e é a lição:** `testa-proxy.py` cortava a célula no
comentário `# Túnel do Cloudflare` para executar só o proxy. Com o ngrok, esse
comentário passou a morar dentro de um `if` — cortar ali produz um `if` sem
corpo, e o teste morreria de `SyntaxError` em vez de testar coisa alguma. O corte
agora é uma marca combinada e explícita dentro da célula, e o script **recusa
rodar** se ela não estiver lá exatamente uma vez. Marca de corte implícita é
acoplamento que ninguém enxerga até quebrar.

**E a medição estava medindo diferente da produção.** A célula 3 comparava o
rótulo do modelo com o esperado de forma exata, sem `lower()`; o inventário faz
`.trim().toLowerCase()` antes de comparar (`lerSaidaDoModelo`). Parece rigor a
mais — e seria, se caísse em qualquer outro lugar. Cai no contador de **erro
perigoso**, que só dispara com `veio in DO_ROBO`, e `DO_ROBO` é minúsculo: um
`"Saudacao"` com maiúscula, respondido a uma fala que deveria ir para gente,
contava como erro comum aqui enquanto lá o `toLowerCase()` o transforma em
`saudacao` e o robô atende. O único contador que existe para pegar essa falha
podia deixá-la passar. Não é hipótese: o modelo foi visto escrevendo com
maiúscula. A célula agora normaliza igual, e guarda o rótulo cru para o relatório
— saber que o modelo escreveu diferente é justamente o que se perde ao
normalizar cedo demais. **Medição de segurança que não normaliza como a produção
não está medindo a produção.**

Testes: as 9 travas de `testa-proxy.py` seguem passando contra a célula nova.

### 31.2 — Quem a empresa é também não se responde de improviso

**Contexto:** com o 3B rodando na GPU (31.1), a primeira medição de verdade
pegou o robô dizendo a um interlocutor que **"a Cobratec é uma empresa de
tecnologia"**. Não é: é empresa de cobrança. O prompt dizia que ele era "a
recepcionista virtual da Cobratec" e nunca dizia o que a Cobratec faz — o modelo
preencheu o vazio, como faz sempre.

Duas correções candidatas, medidas nos dois modelos em vez de escolhidas por
opinião:

| | inventou | respondeu certo |
|---|---|---|
| 3B, prompt como estava | **4/5** | 0 |
| 3B, com o ramo no prompt | 0/5 | 4 |
| 1B, prompt como estava | — | 0 |
| 1B, com o ramo no prompt | — | 2 |

O fato no prompt resolve o 3B e **não resolve o 1B**, que é justamente o que
roda na máquina do escritório. O que o 1B produziu é pior que o erro do 3B:

- *"A Cobratec é um serviço de pagamento da **Receita Federal**"*
- *"Atuamos como uma agência de assistência financeira"*
- *"Vocês são funcionários da Cobratec"* (inverteu quem é quem)

A empresa se apresentando como o que não é, para quem está sendo cobrado, não é
constrangimento — é a mesma família do art. 42 que motivou a decisão 31. E
alegar ligação com a Receita Federal a um devedor é pior do que qualquer número
inventado.

**Decisão: as duas.** A garantia é a regra em `assuntoExigeGente` — "o que vocês
fazem", "que empresa é essa", "quem são vocês", "o que é a Cobratec" passam a ir
para gente **sem consultar o modelo**. O ramo entra no prompt como reforço, para
as frases que a regra não pega; ele custa oito tokens e comprovadamente conserta
o modelo que consegue usá-lo.

**"Quem fala?" continua com o robô.** É a abertura mais comum, e os dois modelos
respondem certo ("sou a recepcionista da Cobratec"). Escalar isso também deixaria
o robô sem nada que ele saiba fazer.

E sobra o incômodo de sempre: o que resta ao robô é receber bem e passar
adiante. É pouco, e é o que ele pode garantir. Um triador que acerta a saudação
e entrega o resto vale mais que um atendente que inventa a quarta frase.

**O 1B nesta máquina é marginal, e agora há número.** Na mesma rodada: 121,5s
numa resposta (o teto do webhook é 45s), 58s numa carga fria, e a saudação
"bom dia, tudo bem?" devolvendo literalmente **"O que dizer"** — o rótulo do
campo JSON, que `avaliarResposta` barra e escala. O desenho segurou em todos os
casos, mas o preço é o devedor esperando o teto estourar para então cair na
fila. O 3B na GPU respondeu tudo entre 1s e 2s. Se o robô for para valer, o
caminho não é afinar prompt: é uma máquina com GPU **dentro da rede**.

Testes: 552 → **554**.

## 32. O modelo classifica, o código responde

**Contexto:** as decisões 31, 31.1 e 31.2 são a mesma história contada três
vezes. Cada medição achava uma invenção nova — "empresa de tecnologia", "um
serviço de pagamento da Receita Federal", um telefone que não existe, um horário
de sábado — e cada correção era um remendo depois do fato: barrar o texto pronto,
escalar mais um assunto, pôr mais um fato no prompt. O robô ficava mais seguro e
mais inútil a cada rodada, até sobrar "receber bem e passar adiante".

A pergunta estava errada. "Como impedir o modelo de inventar?" não tem resposta
boa. A pergunta certa é **"por que ele está escrevendo?"**.

Ele não precisa. Classificar intenção é o que um modelo pequeno faz bem; redigir
fato que ele não tem é o que ele faz mal. Então ele só classifica.

### O desenho

    devedor  →  [lista de palavras]  →  modelo  →  [lista de 12 rótulos]
                       ↓ grave                            ↓
                     gente                          lib/chat-fluxo.ts
                                                          ↓
                                    Siscobra (só leitura) + regra da carteira
                                                          ↓
                                    lib/chat-respostas.ts  →  o que o devedor lê

O modelo devolve **uma palavra**. Cada frase que chega ao devedor sai de um molde
preenchido com campo do banco. A garantia que se buscava desde a decisão 31 deixa
de ser uma promessa sobre comportamento e vira uma propriedade da estrutura:
**nenhum número, nome ou data que o devedor lê passou pelo modelo** — não porque
ele foi instruído a não inventar, mas porque não tem por onde.

Rótulo fora da lista vira `outro`, e `outro` é gente. O caminho do erro é o
caminho seguro, em todas as três travas: palavra na entrada, rótulo na saída, e
o fluxo não ter molde para o caso.

### O que isso destrava: o robô pode conversar

Antes ele passava para gente quase de imediato, e estava certo — sem dado, cada
turno era uma chance a mais de inventar. Agora **o risco não cresce com o número
de turnos**, porque nenhum turno é redigido. Então ele conduz até onde uma
decisão humana é necessária:

- identifica em dois tempos ("recebi o CPF, agora me diga a data") em vez de
  exigir tudo numa mensagem só;
- informa saldo e vencimento, com o valor vindo de `devsalatu`;
- **oferece acordo** dentro de `acordo_regras`, com parcela e desconto
  calculados por `montarOferta` e conferidos por `propostaCabeNaRegra` antes de
  virarem texto — a mesma função que julga proposta de gente;
- avisa antes de sumir. Escalar deixou de ser silêncio: silêncio depois de uma
  pergunta é onde o devedor desiste, porque ele não sabe se foi ouvido.

Onde ele para, por decisão e não por limitação: fechar acordo (quem grava no CRM
é a operadora), qualquer coisa fora da regra, carteira sem regra ativa, duas
carteiras para o mesmo CPF, e todo assunto com consequência jurídica.

### Siscobra ligado — e a decisão 28 revertida

A decisão 28 dizia que o inventário não abre conexão com o Siscobra; o dossiê
chegava empurrado pelo n8n. Aquele desenho supunha o n8n como chatbot. Sem ele, a
alternativa era o robô não ter dado nenhum — que é exatamente o que o fazia
inventar.

A fronteira não sumiu, ficou mais estreita: **somente leitura**, quatro consultas
fixas e parametrizadas em `lib/siscobra.ts`, usuário de banco com `GRANT SELECT`
apenas. As armadilhas de `docs/conversas/siscobra.sql` estão respeitadas —
`conati = 0` é em aberto, o saldo é `convalsal` (`convalconatu` está zerada e
diria "você deve R$ 0,00"), `devvenmaisantigo` em vez da sentinela do contrato,
e nenhum filtro de vigência na regra.

**E o dado não vai para o modelo.** É o que permite o modelo continuar rodando
fora da rede (31.1) sem que a fala do devedor saia da empresa: o que sai daqui
alimenta molde, não prompt.

### O prompt, afinado por medição

O classificador foi medido contra 26 falas reais de cobrança, com `llama3.2:3b`:

| prompt | acertos | erros para o lado perigoso |
|---|---|---|
| sem exemplos | 20/26 | 4 |
| **com exemplos (adotado)** | **26/26** | **0** |
| exemplos + uma instrução a mais | 25/26 | 0 |

O prompt sem exemplos tinha um ímã: frase que o modelo não entendia virava
`despedida` — inclusive "já paguei isso" e "manda o boleto", que são casos de
gente. Os exemplos resolveram.

E a terceira linha é a mais instrutiva: acrescentar *"olhe o que a pessoa quer,
não a educação da frase"* **piorou**. Exemplo ensina; explicação atrapalha. Quem
for mexer no prompt, meça — a intuição erra aqui.

### O 1B não serve para isto

O mesmo teste com `llama3.2:1b`: **10/26**, e o erro dele tende a `saudacao` —
justamente o rótulo que o robô atende sozinho. "Essa dívida não é minha" foi
classificado como cumprimento. A trava de palavras na entrada salva a maioria
desses casos, mas o veredicto é claro: **o classificador precisa de 3B ou mais**.
Com GPU ele responde em ~1,1s; é o argumento mais forte até agora para uma
máquina com GPU dentro da rede (ver 31.1).

Testes: 554 → **584**. `lib/chat-fluxo.test.ts` cobre a conversa turno a turno
sem banco, sem rede e sem modelo — é onde as regras moram.

**Dependência nova:** `pg`. Justificada por ser o cliente oficial de PostgreSQL
e a única forma de ler o Siscobra sem um segundo Prisma apontando para outro
banco.

### 32.1 — A trava de entrada estava desligando o robô novo

**Contexto:** o robô da decisão 32 foi construído, testado turno a turno e
commitado — e não funcionava. Em produção ele nunca teria identificado ninguém
nem oferecido acordo nenhum.

`assuntoExigeGente` é a lista de palavras que manda a mensagem para a fila
**antes** do modelo. Ela nasceu na decisão 31, quando o robô redigia: naquele
desenho, qualquer assunto que encostasse em dinheiro era perigoso, e barrar
"dívida", "parcelar", "desconto" e "cpf" era o que impedia o estrago.

Com o texto virando molde, a mesma lista virou uma armadilha:

- *"meu CPF é 529…"* batia em `\bcpf\b` → fila. **A identificação nunca
  começava** — e ela é o primeiro passo de tudo.
- *"dá pra parcelar?"* batia em `parcel` → fila. A oferta nunca era feita.
- *"quanto eu devo?"* batia em `dívida` → fila. O saldo nunca era informado.

O robô sabia fazer três coisas novas e estava proibido de fazer as três.

### Por que os testes não pegaram

`lib/chat-fluxo.test.ts` cobre as regras chamando `decidir` **direto** — e é
certo que ele faça isso, é o que o torna rápido e sem banco. Só que `decidir`
está *depois* da trava. Nenhum teste percorria o caminho inteiro.

Quem pegou foi `tests/api/chat-siscobra.test.ts`, escrito para uma pergunta
diferente ("o que a rota grava?"): a primeira mensagem de teste era "meu cpf é
529…", e a conversa foi para a fila em vez de identificar. **O teste de
integração encontrou o que trinta testes de unidade não viam** — não porque
fossem fracos, mas porque testavam um pedaço que estava certo.

Junto veio outro defeito da mesma família: o `update` do Prisma recebia
`devcod`/`carcod` (nomes do fluxo) em vez de `siscobraDevcod`/`siscobraCarcod`
(nomes da tabela), e falhava. Agora existe `paraOBanco()`, uma tradução
explícita — espalhar um objeto no outro parecia funcionar e não funcionava.

### O critério novo da trava

Antes: *"o modelo pode inventar aqui?"* — pergunta que fazia sentido quando ele
escrevia. Agora: **"existe molde honesto para isto?"**. Onde não existe, quem
responde é gente, mesmo que o modelo classifique com toda a confiança:

- **pagamento alegado** — o robô não confere baixa no CRM;
- **jurídico** — advogado, Procon, processo;
- **contestação** — "não é minha", golpe, fraude;
- **dado bancário oferecido** — nenhum molde nosso pede cartão ou conta;
- **horário e endereço** — fatos que o *código* também não tem.

Dívida, valor, parcelamento, desconto e CPF saíram: para todos eles existe molde,
e o molde diz a verdade.

Testes: 568 → **578**, agora com o caminho inteiro coberto.

### 32.2 — Escalonamento mudo não compila mais

**Contexto:** rodando o app de casa, a consulta ao Siscobra falha com
`EHOSTUNREACH` — o CRM mora num endereço de LAN. Isso é esperado. O que não era
esperado é o que o devedor recebia: **nada**.

O caminho era este: a pessoa manda CPF e data de nascimento → `identificar`
falha → o fluxo escala com um motivo para a operadora → e o webhook só envia
mensagem quando existe `aviso`, que ali não existia. A conversa ia para a fila
em silêncio, logo depois de alguém entregar um dado pessoal. É o pior momento
possível para emudecer: parece descaso, ou parece golpe.

**A correção não foi preencher o campo — foi tornar o campo obrigatório.**
`aviso` deixou de ser opcional no tipo `Acao`, e o compilador apontou os quatro
lugares que o deixavam vazio (o meu `grep` tinha achado dois: ele olhava as
linhas seguintes e via o aviso do bloco de baixo). Agora não dá para acrescentar
um escalonamento mudo sem quebrar o build.

`motivo` é para a operadora, `aviso` é para o devedor — os dois, sempre.

Um cuidado que veio junto: o aviso **não repete o motivo**. "Carteira sem regra
de acordo ativa" é vocabulário nosso; para quem está do outro lado é "vou chamar
uma atendente — ela tem as condições certas para o seu caso". E onde o robô não
tem saldo para negociar, ele não diz que não há dívida: "você não deve nada" é a
frase mais cara que ele poderia soltar. Há teste cobrindo os dois lados.

**Nota operacional:** o app precisa enxergar a LAN do escritório para o robô
identificar alguém. Fora dela, ele ainda cumprimenta e diz o que a empresa faz —
some o que depende de dado, com aviso ao devedor e motivo na fila.

Testes: 578 → **585**.

### 32.3 — O código de cadastro grudado no nome do devedor

**O sintoma:** o robô cumprimentava "Olá, 760361Gabrieli!". O `devnom` do
Siscobra às vezes traz o código de cadastro antes do nome, e a consulta tirava o
primeiro nome com `split_part(devnom, ' ', 1)` — que resolve a forma separada
por espaço ("40067713 ANA CLAUDIA") e não a forma **colada** ("735705Violene
Badio"), onde o código e o nome são a mesma palavra.

**A regra saiu de uma medição, não de um palpite.** Consultando o banco de
produção, o `devnom` tem três formas com dígito, e só uma é código:

| forma | exemplos | o que é |
|---|---|---|
| 2+ dígitos no início | `40067713 ANA CLAUDIA`, `735705Violene Badio` | código de cadastro (6 a 8 casas) |
| 1 dígito no início | `7M INSTALACOES`, `3F SERVICOS`, `3C SERVICES`, `3 B S COMERCIO` | **razão social de verdade** |
| dígito no meio da palavra | `SANT0S`, `C0RREIAS`, `RODRIG8UES` | erro de digitação (zero no lugar do O) |

Daí o corte ser em **2 ou mais**, colado ou não: cortar todo dígito inicial
transformaria "7M INSTALACOES" em "M INSTALACOES", e limpar o meio da palavra
produziria "SANTS". O caso `3 B S COMERCIO` devolve `"3"` de propósito, e tem
teste dizendo isso — é o freio para quem vier "consertar" depois.

**A regra desceu do SQL para o TypeScript** (`primeiroNomeDe`, em
`lib/siscobra.ts`). Uma regra com exceção precisa de teste, e SQL embutida em
string não tem nenhum: era exatamente por não ter que a forma colada passou
despercebida até chegar na cara de um devedor. O nome completo é lido pela
consulta mas **não entra** no objeto devolvido — o robô precisa só do primeiro,
e o que não sai daqui não vaza adiante por descuido.

Conferido contra produção antes de fechar: de 14 nomes reais que começam com
dígito, 13 passaram a sair certos e o 14º é o `3 B S`, que já estava certo.

Testes: 594 → **602**.


## 33. Apagar a conversa (e por que não a mensagem)

**Contexto:** teste com um número só, usado muitas vezes. A cada rodada o robô
já sabia o CPF da rodada anterior e pulava a identificação — o teste seguinte
nunca começava do começo. O pedido veio como "apagar as mensagens do chatbot".

**A observação que muda o desenho:** a memória do robô não está nas mensagens.
Está na `Conversa` — `siscobraDevcod`, `identificadaEm`, `cpfPendente`,
`nascimentoPendente`, `saldo`, `vencidoDesde`, `oferta` e `dossie`, os campos
que a decisão 32 criou justamente para a conversa não recomeçar a cada fala.
Apagar as mensagens deixaria a **tela limpa e o robô sabendo de tudo**: o pior
dos dois mundos, porque some a evidência e fica o efeito. Quem pede para apagar
mensagem quer que o robô **esqueça**, e esquecer é outra tabela.

Então a operação é apagar a conversa inteira, e a UI diz isso na confirmação —
lista o que some (CPF, nascimento, saldo, proposta), porque a intuição erra aqui
e a pessoa apagaria esperando um efeito e teria outro.

**E é isso que resolve a tensão com o append-only.** `ConversaMensagem` declara
no próprio schema que mensagem enviada ao devedor não se edita nem se apaga — é
registro de cobrança. A regra continua de pé: o que some não é uma fala escolhida
a dedo, é o registro inteiro. Apagar mensagem avulsa deixaria um histórico
**adulterado**, que é pior que histórico nenhum, porque parece íntegro. Uma
cobrança ou existe como prova inteira, ou não existe.

Três consequências, cada uma com um dono claro:

- **Só ADMIN** — `exigirAdmin`, e não o `exigirChat` das rotas vizinhas. Quem
  atende não apaga o registro do que disse ao devedor.
- **Os anexos saem junto.** O arquivo mora fora do banco (decisão 30); sem a
  linha que aponta para ele, um áudio de devedor ficaria parado no disco sem
  nada que levasse até lá — ninguém acharia para apagar depois. Banco primeiro,
  disco depois: enquanto a linha existe o anexo continua sendo servido, então
  derrubar a linha é o que de fato o tira do alcance. Arquivo já ausente conta
  como sucesso, não como falha.
- **A trilha é o que torna aceitável poder apagar:** some a conversa, fica quem
  mandou sumir. Telefone entra (mesma escolha do PATCH vizinho); CPF, saldo e
  corpo de mensagem, nunca — auditoria não é lugar de dado de devedor.

O teste que importa não conta linhas apagadas: ele identifica a conversa, apaga,
entrega **a mesma mensagem do mesmo telefone** e confere que a conversa nova
nasce sem `siscobraDevcod`, sem `cpfPendente`, sem `saldo` e sem `oferta`. É a
prova do pedido de verdade, que estava atrás da palavra "mensagens".

Testes: 589 → **594**.

## 34. A dupla verificação virou documento + nome do titular

**O que motivou:** olhando o Siscobra para outro conserto (32.3), apareceu que as
**2.532 empresas** do cadastro têm `devdatnas = 0001-01-01` — a sentinela de "não
tem data", a mesma armadilha já documentada em `convenmaisantigo`. Empresa não
nasce. Com nascimento como segundo fator, **nenhuma delas conseguia se
identificar**: o robô pedia um dado que não existe e a conversa ia para a fila,
sempre. Não era um caso de borda; era um sexto do cadastro fora do robô.

A trava continua sendo dupla — mudou o segundo fator. CPF + nome do titular,
CNPJ + razão social: pessoa física e jurídica passam pela mesma porta.

**A regra de conferência: dois pedaços quaisquer** (`nomeConfere`, em
`lib/identificacao.ts`). Ordem trocada passa, nome do meio omitido passa,
"Gabrieli" sozinho não passa. Foi escolha entre uma conferência exata — que
recusaria quem digita "Gabrieli Sousa" em vez do nome inteiro — e esta, que troca
rigor por identificação que acontece. Dois e não um porque "SILVA" bate com
dezenas de milhares de cadastros, e o primeiro nome é o que qualquer parente
sabe. Não contam como pedaço: partícula (DE, DA, DOS), letra solta, corrida de
dígitos e sufixo de razão social — LTDA + ME bateria em qualquer empresa do
banco. Cadastro de uma palavra só ("735705Violene") exige aquele único pedaço,
porque exigir dois seria exigir o impossível.

**O preço, dito em voz alta:** razão social é informação **pública** (consulta na
Receita). Para empresa, o segundo fator é mais fraco do que era. A escolha foi
feita sabendo disso, porque empresa travada é empresa que não negocia. Se um dia
doer, o conserto é um terceiro dado não público (valor da última fatura), e não
voltar ao nascimento — que empresa nenhuma tem.

**O defeito que o segundo fator novo trouxe, e que o teste pegou.** Data se
reconhece sozinha: "12/04/1985" só pode ser uma data. **Nome não tem forma
nenhuma** — qualquer frase com duas palavras parece um. Na primeira versão,
"bom dia, tudo bem?" era lido como identificação e o robô respondia "recebi o
nome, agora me envie seu CPF" a quem só tinha cumprimentado. Quem quebrou foi o
teste do modo direto, que exige a saudação sair de molde.

O conserto não foi apertar a detecção — foi trocar quem decide. **O nome só conta
quando o robô está esperando um**: há documento pendente, o documento veio na
mesma mensagem, ou o classificador disse "identificar". Quem qualifica aquilo
como nome é o **contexto**, não o formato. Tem teste de regressão nos dois
sentidos: frase comum não vira nome, e com documento pendente a frase seguinte
vira.

**Onde a conferência mora.** No TypeScript, não no SQL. A consulta traz os
candidatos pelo documento e `nomeConfere` decide quem passa — nada é revelado
antes disso. É a mesma lição da 32.3: regra com exceção precisa de teste, e
`LIKE` dentro de string não tem nenhum.

**Recusa não diz qual metade falhou.** "Documento não existe" e "nome não
confere" respondem a mesma coisa. Distinguir entregaria, a quem só tem uma lista
de CPFs, a informação de que aquele CPF é de devedor nosso — que é exatamente o
que a dupla verificação existe para impedir.

Saíram junto `cpfValido` e `normalizarNascimento` de `chat-intencao.ts`: viraram
código morto, e as regras novas moram em `lib/identificacao.ts`. Manter cópias
seria o convite para divergirem, como a lista de papéis divergiu uma vez (25.1).

O prompt do classificador mudou uma linha ("CPF, data de nascimento ou nome" →
"CPF, CNPJ ou nome") e **foi medido de novo**, contra o modelo de verdade, como o
próprio arquivo manda: **26/26 certos, 0 erros perigosos, média 1,1s**.

Migration: `documentoPendente` e `nomePendente` no lugar de `cpfPendente` e
`nascimentoPendente`.

Testes: 602 → **624**.

### 34.1 — O robô parou de gritar com o devedor

O primeiro atendimento de verdade devolveu **"Olá, PEDRO!"**. O Siscobra guarda o
nome em caixa alta, o molde emendava direto, e caixa alta em mensagem é grito —
na conversa de alguém que está sendo cobrado, isso tem custo.

A abertura virou **"Pedro, aqui é a Cobratec…"**: chama pela pessoa, sem o "Olá,
NOME!". Sem nome no cadastro, continua "Olá! Aqui é…".

Três detalhes que a mudança trouxe, e cada um tem teste:

- **A maiúscula depois da vírgula.** Emendar "Pedro, " num texto que começava em
  maiúscula produzia "Pedro, Localizei…". Por isso `abrir()` recebe a frase em
  minúscula e decide a caixa — sem nome, ela vira o começo da mensagem.
- **`nomeProprio` capitaliza só letra.** Um `toLowerCase` seco transformaria a
  razão social "7M" em "7m" (as que começam com dígito existem — decisão 32.3).
- **Só a primeira palavra.** Depois de identificado o nome já vem assim, mas
  ANTES o que existe é o `pushName` do WhatsApp, texto livre escrito pela pessoa
  no próprio aparelho: "Isaac Ferraz - Cobratec" é um real, visto em teste, e
  emendá-lo daria "Isaac Ferraz - Cobratec, aqui é a Cobratec…".

Fica anotado o que **não** mudou, porque foi levantado e não decidido: antes da
identificação, quem nomeia é o pushName — e o robô chama a pessoa pelo nome logo
antes de dizer "preciso ter certeza de que é você mesmo". Não vaza nada nosso (o
nome é o que a própria pessoa pôs no aparelho), mas soa contraditório, e no teste
os dois nem batiam: saudou "Isaac" e o cadastro era "Pedro".

Testes: 624 → **631**.

### 34.2 — O robô virou eco no primeiro teste com gente

A conversa real:

```
[devedor]  olá
[robô]     Isaac, aqui é a Cobratec. Posso ajudar com sua negociação por aqui mesmo.
[devedor]  boa tarde
[robô]     Isaac, aqui é a Cobratec. Posso ajudar com sua negociação por aqui mesmo.
```

**A mesma frase, palavra por palavra.** Eco é a forma mais rápida de alguém
perceber que fala com máquina e desistir — e em cobrança, desistir é o resultado
que custa. O robô não tinha como evitar: nada na `Conversa` registrava que ele já
havia cumprimentado, então cada saudação era a primeira.

Entrou `saudacoes` (contador, não booleano) e o ramo passou a ter três estados:

1. **primeira** — a saudação de boas-vindas;
2. **segunda** — outra frase, mais curta, apontando o que dá para pedir;
3. **terceira** — **escala**. Inventar uma terceira frase seria o mesmo defeito
   com outra roupa; quem cumprimenta três vezes sem dizer o que quer está
   esperando uma pessoa.

**E a frase de abertura mudou de natureza.** Ela era um aviso — dizia o que a
empresa faz e deixava a pessoa sem nada para responder. Agora **termina em
pergunta**: "Posso verificar se há algo em aberto no seu nome e resolver com você
por aqui mesmo, sem precisar de ligação. Quer que eu dê uma olhada?". Silêncio
depois da primeira mensagem é a conversa morrendo, e pergunta é o que a mantém.

O que ela continua **não** dizendo: que existe dívida. Antes de conferir
documento e nome não se sabe com quem se fala, e afirmar pendência a quem herdou
a linha conta a um estranho que o antigo dono devia — o mesmo vazamento que
manteve a consulta por telefone fora de `lib/siscobra.ts`. Tem teste para isso,
porque é o tipo de frase que alguém "melhora" sem perceber o que quebra.

Testes: 631 → **639**.

### 34.3 — Robô caído não pode parecer devedor estranho

Segundo teste com gente: "olá" recebeu **"Só um momento que uma atendente entra
aqui na conversa."** Escalar estava certo — a sessão do Colab tinha caído e o
túnel respondia 530, então o modelo não respondeu e o caminho do erro é o
caminho seguro, como projetado.

**Errado estava o motivo.** Qualquer falha do modelo virava `outro`, e `outro`
tem motivo "assunto fora do que o robô atende". Ou seja: com o robô morto, a
fila enchia dizendo que o **devedor** falou algo fora do escopo. A operadora
procuraria o problema na fala da pessoa, e o TI não veria pela fila que o modelo
tinha caído — o diagnóstico apontava para o lugar errado.

`Leitura` ganhou `respondeu: boolean`, **obrigatório** (mesma razão do `aviso` em
`Acao`: o compilador cobra de quem construir uma `Leitura` nova). O fluxo
verifica antes de tudo e escala com "o robô está fora do ar (o modelo não
respondeu)".

**Para o devedor não muda nada** — ele lê o mesmo aviso de sempre, e a
infraestrutura da empresa não é problema dele. Tem teste provando que o `aviso` é
idêntico ao do escalonamento comum e que só o `motivo` difere.

Testes: 639 → **642**.

---

## 35. Relatórios: o dashboard virou dois, e o segundo lê o CRM

**O que motivou:** o painel da casa respondia a uma pergunta só — a do TI
("quantas máquinas, quais pendências"). A pergunta que a operação faz o dia
inteiro ("quantos acordos já fecharam hoje?") vivia em outro lugar: no projeto
irmão `siscobra_postgresql`, como SQL validada e um painel Streamlit que roda na
máquina de quem sabe rodar. Regra certa, alcance nenhum.

"Dashboard" deixou de ser uma tela e virou uma **chave de duas posições**:
**Informática** (o painel de sempre, em `/`) e **Cobrança** (`/relatorios/cobranca`).
O alternador aparece no cabeçalho das duas.

### O que veio pronto — e o que teria dado errado sem ele

As regras não foram inventadas aqui. Vieram do `siscobra_postgresql`, onde cada
uma foi conferida contra o PDF que o próprio Siscobra imprime. O que se aproveitou
foi justamente a parte que ninguém adivinha, porque **as colunas de nome óbvio
são as erradas**:

| Pergunta | O que parece | O que é |
|---|---|---|
| Quanto foi o acordo? | `acoval` (só o principal) | **`acovalatu`** — total com juros/multa |
| Quando ele aconteceu? | `acodatcad` | **`acodatinc`** — em carteira recorrente, `acodatcad` é a data da PARCELA e some do dia |
| De quem é o acordo? | `acousuinc` (quem gravou) | **`retusucod`** da última ação manual — quem trabalhou o caso, não quem digitou |
| Quantas ações a operadora fez? | todas de `retorno` | **`rettip = 0`** — o `7` é o discador automático, ~95% de 55M linhas |
| Quem fez a ação? | `retusucod` | **`usucod`** — trocar os dois derruba a conferência de 100% para ~97% |

Repare que acordo e acionamento usam colunas de usuário **trocadas entre si**.
Parece engano e não é: no acordo se quer o *responsável* pelo devedor; no
acionamento, o *autor* da ação. Está comentado em `lib/relatorios-cobranca.ts`
porque é exatamente o tipo de coisa que alguém "corrige" de boa-fé.

### O que se decidiu aqui

**Uma varredura, quatro recortes.** A tela mostra o mesmo conjunto por operadora,
por carteira, por hora e no total. São `GROUPING SETS`, não quatro consultas: no
acordo, cada varredura extra repetiria o `LATERAL` de atribuição, que é a parte
cara. Medido no banco de produção: 130 ms para o dia, 340 ms para 44 dias.

**A hora vazia fica no gráfico.** Hora sem acordo não volta do banco, e omiti-la
cola as barras das 11h e das 13h — o gráfico contaria que o time trabalhou sem
parar no horário em que ninguém atendeu. O silêncio das 12h é informação.

**Teto de 92 dias.** `retorno` tem 55M linhas e o CRM é o banco onde a operação
está trabalhando agora. O trimestre foi medido em menos de um segundo; o ano
abriria a porta para um painel esquecido aberto segurando conexão de quem atende.

**Cache só nos seletores, nunca nos números.** A lista de carteiras custa 2,6s e
muda quando alguém cadastra uma carteira: fica uma hora em memória. Os números
não entram — a primeira pergunta da tela é "quantos até agora?", e responder com
o número de um minuto atrás no momento em que a operadora fecha o acordo é pior
do que responder devagar. Quem protege o CRM é o teto, não o cache.

**"Hoje" é calculado no fuso do Brasil.** O container sobe em UTC; às 21h de São
Paulo já é o dia seguinte lá. Sem `hojeNoBrasil()`, o painel zeraria no fim do
expediente — que é justamente quando se olha. O Siscobra grava
`timestamp without time zone` com hora de parede do Brasil, então a data precisa
ser calculada no mesmo fuso em que foi gravada.

**Prazo próprio para a consulta.** O `statement_timeout` de 8s do pool foi
escolhido para a conversa de WhatsApp (decisão 32) — quem espera resposta no
celular não aguenta mais. Relatório é o oposto: `consultaRelatorio` roda em
`BEGIN READ ONLY` com `SET LOCAL statement_timeout`, que vale só dentro da
transação. O `READ ONLY` diz ao banco o que o arquivo já dizia ao leitor: aqui
não se escreve.

### Quem enxerga — e por que não é a mesma lista do `/chat`

**Admin e supervisor.** A decisão 27 fechou a cobrança para o supervisor de sala,
e isto não a reabre: o que ela protege é **dado pessoal de devedor** — nome, CPF,
dívida, conversa. O relatório não tem nada disso. Ele agrega **produção de
funcionário**: contagem, valor, hora, situação. O alcance sobre dado de terceiro
se decide pelo ofício; o alcance sobre a produção da casa, não.

**A operadora de cobrança fica de fora**, e é deliberado: o relatório é um
ranking nominal das colegas dela. Quem atende devedor não precisa dele para
atender.

**O portão é `exigirRelatorio`** (`lib/autorizacao.ts`), ao lado de `exigirEscopo`
e `exigirChat`, espelhado em `PERMITIDO_SUPERVISOR` (middleware) e no item de nav.
Três cópias da mesma regra — a decisão 25.1 já mostrou o que acontece quando uma
delas diverge, por isso as três estão citadas uma na outra.

**E o supervisor vê o relatório INTEIRO, sem recorte de sala.** Isto é uma
exceção ao princípio da decisão 24 e merece estar escrita: `Sala` é divisão
física do inventário, `grupo` é a equipe no Siscobra, e **os dois nunca foram
ligados**. Inventar o vínculo agora produziria um número que ninguém sabe
explicar. O recorte que o gestor quer é o que ele escolhe no filtro de equipe —
que é, aliás, a função pedida. O caminho para recortar de verdade existe e está
anotado: `Usuario.siscobraUsucod` × `grupo.usugrusupcod` (o supervisor da equipe
no próprio CRM). Não foi feito porque `siscobraUsucod` hoje anda colado ao papel
`COBRANCA` (decisão 27) e desamarrá-lo é outro trabalho.

### A cor foi medida, não escolhida

Acordo é teal, acionamento é violeta, em todo gráfico e com qualquer filtro — a
cor segue a **entidade**, nunca o ranking; se seguisse a posição, filtrar uma
equipe repintaria as barras e quem aprendeu "teal = acordo" leria errado no
segundo olhar. Os quatro hexes (dois por tema) passaram no validador de paleta:
separação ΔE **18,9** sob deuteranopia (o piso é 8) e 27,0 na visão normal,
dentro da faixa de luminosidade e acima do piso de croma nos dois temas. Ficam em
`--serie-acordo` / `--serie-acionamento` no `globals.css`, junto dos outros pares
claro/escuro, porque trocar um hex no olho quebra isso em silêncio: quem enxerga
cor não nota, quem não enxerga perde o gráfico.

**Nunca dois eixos no mesmo plano.** 97 acordos e 3.000 acionamentos alinhados no
mesmo topo sugerem empate. São dois gráficos, cada um com a sua escala.

**O valor nunca mora só no hover.** Toda barra é alcançável pelo teclado, e a
visão **"detalhado"** — que o usuário pediu como "algo resumido ou não" — é
também o gêmeo em tabela de cada gráfico: quem usa leitor de tela, quem imprime e
quem não distingue as duas cores leem os mesmos números.

### O que ficou de fora, de propósito

**Recuperação (dinheiro que entrou).** A fonte ainda é disputada no projeto irmão
(D-003 vs D-009): `deposito_registro` tem ~R$ 27M quase todos de um mês,
`operacao` tem ~R$ 112M com datas de 2019 até hoje, e nenhuma das duas foi
conferida contra relatório oficial de recuperação. Publicar um número de dinheiro
sem saber qual é o certo é pior que não publicar nenhum.

**Taxas e percentuais de conversão.** Acordado e recuperado vêm de fontes
independentes com datas próprias; em janela curta a razão passa de 100% (D-005).
A tela mostra absolutos.

**Exportação para Excel.** Cabe, e não foi feita agora: a planilha de hoje é a do
inventário, e misturar as duas é outro trabalho.

Testes: 642 → **685** (`lib/relatorios.test.ts`, 21 casos de período e fuso;
`tests/api/relatorios.test.ts`, 17 de portão, validação e falha do CRM; mais 5 no
`middleware.test.ts`).

## 36. A carteira de acordos: o que vem, e o que "em atraso" pode dizer

A decisão 35 respondeu **o que fechou**. Faltava a pergunta seguinte, que é a
que sustenta a carteira depois da assinatura: **o que vence nos próximos dias e
o que venceu sem entrar**. Ela não existia em lugar nenhum — nem aqui, nem no
projeto irmão, cujo `CLAUDE.md` lista "valor total em aberto e aging (faixas de
atraso)" como KPI desejado e nunca implementado.

Tela nova em **`/relatorios/carteira`**, ao lado de `/relatorios/cobranca` no
alternador. Separadas e não abas do mesmo painel porque os filtros são de
naturezas opostas: lá o período olha para trás, aqui a janela olha para frente,
e um seletor só serviria mal aos dois. As consultas vivem em
**`lib/relatorios-carteira.ts`**, no mesmo molde do arquivo vizinho — uma
varredura por consulta, `GROUPING SETS` devolvendo todos os eixos empilhados,
`$1..$4` na mesma ordem.

### A parte fácil: a parcela existe e é confiável

`acordo_parcela` (1,25 milhão de linhas) tem `acoparnum`, `acoparvallan` (valor)
e `acopardatven` (vencimento), ligada ao acordo por `acocod`. A agenda de
vencimento sai daí direto.

A **atribuição por operadora** é copiada, não reinventada: o mesmo
`LEFT JOIN LATERAL` sobre `retorno.retusucod` da decisão 35 (última ação manual,
janela de 30 dias, fallback `acousuinc`). Quem fechou o acordo é quem deve
lembrar do boleto. A diferença é que aqui ele roda **por acordo e não por
parcela** — um acordo em 12x são 12 linhas, e repetir a parte cara doze vezes
para chegar ao mesmo nome seria pagar doze vezes pela mesma resposta.

### A parte difícil: "paga" não é uma coluna

Nenhuma coluna de pagamento da parcela funciona neste banco. O ADR **D-009** do
projeto irmão mediu uma a uma: `acoparvalrec` e `acoparvalrep` são 0,
`acoparstacal` é vazio, `boleto.bolvalpgo` é 0, `boleto.boldatpar` e
`acordo.acodatrec` são a sentinela `0001-01-01`, e `conparstacal = '1'` **não**
significa paga (só ~2% delas têm baixa).

O dinheiro está nas razões de baixa: `boleto_baixa` (~R$ 82M) e `operacao`
(~R$ 112M). A cadeia até a parcela é
`acordo_parcela → boleto → boleto_baixa`.

**Por que o join casa quatro colunas e não duas.** `boleto.bolcon` guarda o
código da negociação, e a negociação pode ser um ACORDO **ou** um CONTRATO — os
dois numerados em sequências próprias. Casar só `bolcon = acocod AND bolpar =
acoparnum` faz um contrato de mesmo número passar por acordo, e a parcela de uma
pessoa aparece paga pela baixa de outra. Por isso o join exige também
`boldevcod = devcod` e `bolcarcod = carcod`: mesmo número, mesmo devedor, mesma
carteira. Não é prova — é o quanto dá para estreitar sem uma coluna de tipo.
(`boleto_controle.bolacocod` existiria para isso e nenhum diagnóstico do projeto
irmão a validou.)

**A consequência está escrita na tela, com todas as letras:** "em atraso" aqui
quer dizer **venceu e não achamos a baixa**, não "o devedor não pagou". Um
painel que chama de caloteiro quem já pagou queima a confiança no relatório
inteiro, inclusive na metade que está certa.

**E por isso existe `scripts/validar-parcelas.ts`** (`npm run
db:validar-parcelas`), somente leitura, que mede a cobertura desse join, compara
o de 4 colunas com o de 2, cruza com `operacao` para achar acordo recebendo que
o boleto não vê, e imprime uma amostra por carteira para conferência contra o
PDF oficial. Ele termina com um veredito de três faixas — acima de 40% de
cobertura o número sai limpo; abaixo de 20% ele **não deve** ser publicado como
valor absoluto. É a mesma disciplina que fez o `SQL_ACORDOS` bater 104/104: SQL
que ninguém conferiu é SQL que não funciona.

### O painel que ninguém tinha: a primeira parcela

Dos acordos fechados nos últimos 90 dias cuja 1ª parcela já venceu, quantas
foram honradas. É o divisor entre acordo que vinga e acordo que só ocupou a
agenda — e no relatório de produção os dois contam igual. Junto vem o de
**acordos quebrados** (`acoati = 1`, por `acodatqueaco`), que é o flag que o
relatório de produção **exclui**: lá quebra é ruído, aqui é o assunto. Fechar e
quebrar não é produção, é retrabalho.

### Três papéis, uma tela, recortes diferentes

Este é o único relatório que três papéis alcançam, e cada um leva uma coisa:

| | agregados | ranking por operadora | lista com nome de devedor |
|---|---|---|---|
| ADMIN | sim | sim | sim |
| SUPERVISOR | sim | sim | **não** |
| COBRANCA | sim | **não** | sim |

**A cobrança entra** porque a agenda de vencimento é a agenda de trabalho dela —
quem liga para o devedor amanhã é quem precisa saber que o boleto vence amanhã.
Negar a tela empurraria o trabalho de volta para o Siscobra, que é de onde este
painel existe para tirá-lo.

**E não leva o recorte por operadora**, porque a decisão 35 tirou a cobrança do
relatório de produção justamente por ele ser um ranking nominal de colegas — e a
carteira por operadora é o mesmo ranking com outro nome. O corte é feito **no
servidor**, apagando as listas antes de virar JSON, e não escondendo o bloco na
tela: é a mesma escolha da nota interna do chamado (decisão 20). O teste
verifica que o nome não sobra em canto nenhum do payload.

**O supervisor não leva a lista nominal.** É a decisão 27 sem nenhuma emenda:
alcance sobre dado de devedor se decide pelo ofício, e o ofício dele é a sala.
Portão próprio, `exigirCarteiraNominal` — e separado do `exigirChat` de
propósito, embora os papéis coincidam hoje: um guarda a conversa, o outro a
carteira, e colá-los faria uma mudança futura vazar para o lado errado calada.

**A lista não carrega sozinha.** Vem num clique, porque é dado pessoal e a maior
parte das visitas à tela é para olhar o número. Tem teto de 300 linhas, e a tela
diz quando cortou — lista truncada em silêncio parece uma carteira menor do que
é. O CPF sai **mascarado da consulta**, não da tela: o que não trafega não vaza
depois por descuido.

**O cruzamento que só este app consegue.** O Siscobra sabe quem deve; o `/chat`
sabe com quem já existe conversa aberta no WhatsApp. Os dois bancos nunca se
falam — o cruzamento é feito em memória, por `devcod`, numa consulta só com os
devedores da página. É o que transforma a lista em ação: em vez de "ligue para
fulano", a linha vira um link para a conversa que já existe.

## 37. O relógio: o app deixou de depender de alguém abrir a tela

Até aqui o sistema era **100% pull**. Garantia vencendo, estoque zerado, boleto
atrasado, backup falhado — tudo existia só enquanto alguém olhava. `grep` por
`cron|node-cron|schedule` no projeto inteiro achava exatamente uma coisa: o ping
do SSE. O backup era a prova do problema: script pronto (`scripts/backup-db.sh`,
com `VACUUM INTO` e rotação), unit de systemd escrita em `docs/backup.md`, e
**nunca agendado**, porque agendar dependia de escolher a máquina.

**Por que dentro do app e não um cron do host.** Um sidecar no compose seria mais
ortodoxo, e perde para a realidade: onde o app vai morar ainda não está
decidido. O que sobe junto com o container é o que funciona no dia em que o
container subir em qualquer lugar — e o backup mostra o que acontece com a
alternativa.

**O preço, dito em voz alta:** vale **uma instância**. Duas rodariam tudo em
dobro. A deduplicação por `chave` no `Aviso` segura o estrago, mas o desenho
supõe uma só — exatamente como o barramento de eventos de `lib/chat-eventos.ts`.

`instrumentation.ts` liga `lib/agendador.ts`, com **duas guardas**:
`NEXT_RUNTIME === "nodejs"` (o hook também roda no Edge, onde não há Prisma) e
`AGENDADOR_LIGADO=1`. A segunda existe porque, sem ela, todo `npm run dev` na
máquina de alguém viraria um agendador — e às 18h o desenvolvedor mandaria o
fechamento do dia para o celular da gerência com os dados do banco de teste
dele.

> **Armadilha de build.** A guarda impede a execução no Edge, **não a
> compilação**: o webpack segue o `import()` mesmo dentro do `if`, chega no `pg`
> e quebra com "Module not found: fs". A correção é um `IgnorePlugin` no
> `next.config.mjs` para os runtimes não-Node. Foi tentado antes com
> `resolve.alias` e **não funcionou** — alias casa com a string do import, e
> `@/lib/...` aqui é path do tsconfig, resolvido por outro caminho. Passou
> batido em silêncio, que é o pior jeito de uma correção não funcionar.

**O que já rodou fica no banco** (`TarefaAgendada`), não em memória: um
`docker compose restart` às 12h05 mandaria o digest do meio-dia de novo, e duas
mensagens iguais é como se treina alguém a ignorar notificação. Junto vão o
resultado e a duração — sem isso, uma tarefa que falha toda noite falha
invisível, que é o defeito que o backup tem hoje.

**A janela de recuperação é de 2 horas.** Faltou luz das 11h às 13h? O digest do
meio-dia ainda vale às 13h. Subiu o container às 19h? Não vale mais — "produção
parcial do dia" chegando depois do expediente não é informação atrasada, é
informação errada. E o dia é gravado **mesmo no erro**: uma tarefa que falha e é
reagendada a cada minuto bate no CRM cem vezes com o mesmo problema.

### Os avisos: gravar antes de enviar

A ordem não é detalhe de implementação, é a decisão inteira. O canal de saída é
o mesmo gateway não-oficial da decisão 29, que pode estar fora do ar, com a
sessão caída ou com o chip banido. Se o aviso só existisse na mensagem, o dia em
que o canal falhasse seria justamente o dia em que ninguém ficaria sabendo de
nada — e a falha do canal é uma das coisas que se quer avisar.

É o **inverso** do `/chat`, onde a regra é entregar primeiro (mensagem fantasma
para o devedor é pior que repetida). Aqui o destinatário é interno e a tela é o
registro que vale; falhar no empurrão vira uma coluna (`entrega`), não um aviso
perdido.

O aviso sai pelo **mesmo número da cobrança** — o WAHA Core só sustenta uma
sessão. Volume baixo e só de saída, mas é o chip banível da decisão 29, e é mais
uma razão para gravar primeiro.

**Nível `info` não vai ao celular** por padrão; alerta e grave, sim. Um resumo
que chega todo dia vira notificação ignorada em duas semanas, e aí o alerta
grave cai no mesmo balde do ruído. Os digests são a exceção explícita
(`empurrar: true`): eles são `info` e ainda assim precisam chegar, porque o
valor deles é justamente não depender de alguém abrir a tela.

### A baseline: por que gravar o que o CRM já tem

`FechamentoDiario` guarda uma linha por dia com os agregados da operação. Existe
por um motivo concreto: o Siscobra é o banco de produção e `lib/relatorios.ts`
impõe teto de 92 dias — sem história própria, *"hoje está fraco"* não é uma
frase que se possa provar. Com ela, o digest das 18h passa a comparar com a
média das últimas quatro mesmas-feiras. Com menos de duas semanas de base ele
diz que não tem base, em vez de inventar uma média de uma amostra só.

Só agregado: nenhuma coluna guarda devedor.

### 37.1 — O backup entrou no relógio (17/08/2026)

A decisão 37 abriu citando o backup como **prova do problema**: script pronto
(`scripts/backup-db.sh`), unit de systemd escrita em `docs/backup.md`, e **nunca
agendado**, porque agendar dependia de escolher a máquina. Depois disso ela
construiu o relógio e agendou digest, fechamento e purga — e deixou o backup de
fora. O exemplo continuou sendo exemplo.

Agora é a quinta tarefa, às **22h**: depois do expediente (o horário que o cron
de exemplo já sugeria) e antes da virada, para a cópia levar a data do dia que
ela guarda. O código está em `lib/backup.ts`.

**Por que não continuar no shell.** O script chama `npx prisma db execute`, e o
container roda o build `standalone` do Next — sem CLI do Prisma. Um cron dentro
do container também não existe (imagem Alpine enxuta, usuário não-root). Chamar
o `.sh` de dentro do app seria arrastar `child_process` para dentro do processo
que atende requisição, para ganhar nada: o que as duas implementações
compartilham é `VACUUM INTO`, que é do SQLite e não nosso. Não há regra
duplicada entre elas — só um comando de uma linha.

**O script não foi tocado**, e continua sendo o caminho de duas coisas que o
relógio não faz: cópia **agora**, com destino escolhido na hora, e cópia com o
**app parado**.

**O padrão mudou de pasta.** O script grava em `backups/`, na raiz do projeto.
A tarefa grava em `data/backups`, que no container é o **volume** — `backups/` na
raiz moraria dentro da imagem e sumiria no próximo `--build`, e um backup que
evapora no deploy é pior que nenhum, porque parece que existe. É a mesma escolha
de `pastaDeMidia()`.

**Só avisa quando falha**, e aí como `grave`. Um "backup ok" chegando todo dia às
22h é a mensagem que se aprende a ignorar em duas semanas — e o dia em que ela
não chegar passa batido junto. O sucesso fica em `TarefaAgendada`, com tamanho e
duração, para quem for conferir.

**A rotação só apaga o que ela mesma gera** (`inventario-AAAAMMDD-HHMMSS.db`),
nunca a pasta inteira: `backups/` do projeto tem hoje um
`dev-seed-para-servidor.db` colocado ali de propósito, e varrer por extensão
levaria exatamente ele. `BACKUP_DIAS` tem **piso de 1** — `0` apagaria a cópia
recém-criada no mesmo minuto, que é o mesmo dedo escorregando no `.env` que a
retenção freia com o piso de 30.

**O que isto não resolve:** a cópia continua no mesmo disco do banco. Contra a
máquina morrer, `BACKUP_DIR` apontando para um NAS montado — dito em três
lugares, porque é o erro fácil de cometer.

#### O defeito que apareceu junto: o relógio lido duas vezes

`tique(agora)` recebia o relógio e `executar()` lia o seu próprio
(`agoraNoBrasil()` sem argumento). Em produção os dois quase sempre concordam —
mas na virada da meia-noite, não: a fotografia das 23h40 gravaria `ultimoDia` já
no dia seguinte, e o dia seguinte se daria por feito e **não rodaria**.

O teste que cobria a deduplicação (`não roda a mesma tarefa duas vezes no dia`)
passava com data fixa de 14/08 e o dia real gravado por baixo — ou seja, **só
passou no dia em que foi escrito**. Um teste que depende da data de hoje é um
teste que já quebrou e ainda não avisou. `executar` passou a receber `agora`, e
o caso da meia-noite virou teste próprio.

Testes: 767 → **780** (`lib/backup.test.ts` 8, mais 5 em `tests/api/agendador.test.ts` — 4 do backup e 1 da meia-noite).

## 38. Retenção: guardar para sempre é uma escolha, e era a errada

O app guarda dado pessoal de terceiro — telefone do devedor, dossiê congelado
com saldo e CPF mascarado, áudio e foto que ele mandou. Não havia política
nenhuma: o dado entrava e ficava, e o único apagamento era o `DELETE` manual da
decisão 33, admin a admin, conversa a conversa. Guardar para sempre não é
neutro; é a escolha mais arriscada das disponíveis, tomada por omissão.

O comentário do schema em `ConversaMensagem.midiaArquivo` já dizia que o anexo
"pode ser purgado sem perder o histórico". Isto é aquilo, escrito.

**Padrões:** conversa **encerrada** há mais de **180 dias** (meio ano cobre
contestação de acordo e reclamação de atendimento, que é para o que o histórico
serve como prova); auditoria com mais de **730 dias**. Ambos em variável de
ambiente, com **piso de 30 dias** na conversa — freio contra o dedo escorregando
no `.env`, porque `RETENCAO_CONVERSAS_DIAS=3` apagaria a semana passada e o erro
só apareceria quando alguém fosse procurar a prova de um acordo.

**Modo seco por padrão.** A purga relata no `/avisos` o que apagaria e não apaga.
Vira `PURGA_MODO=ativo` depois que alguém conferir a primeira lista — a primeira
execução de uma rotina que apaga tem que ser conferida por gente, e um padrão
destrutivo faria a conferência acontecer depois do estrago. No modo seco o aviso
sai como **alerta**, não info: há dado vencido esperando, e a inércia é
justamente o risco.

**Só conversa `encerrada`.** Uma parada há um ano na fila é problema de operação
— apagá-la resolveria o sintoma e apagaria a evidência. E ancorada em
`encerradaEm`, não em `ultimaMensagemEm`: a contagem começa quando o atendimento
acabou, não quando o devedor parou de responder. Sem data de encerramento
(registro antigo), fica.

**Uma a uma, e não `deleteMany`.** O `deleteMany` levaria as linhas e deixaria
todo arquivo de áudio no disco, sem nada que leve até ele. Por isso o corpo do
`DELETE` manual saiu da rota para **`lib/chat-purga.ts`** e é chamado pelos dois
caminhos: a cascata no banco mais os arquivos no disco são um par que precisa de
dono único, e duas implementações divergiriam na segunda vez que alguém mexesse
numa delas — a que roda de madrugada, sem ninguém olhando, é a que ficaria para
trás.

**Anexos órfãos** também saem: arquivo na pasta de mídia sem mensagem apontando
para ele. Eles aparecem (um `deleteMany` antigo, um restore do banco sem o
disco, um download que terminou depois de a conversa sumir), e áudio de devedor
parado no volume, sem trilha e sem dono, é o pior tipo de dado pessoal — ninguém
sabe que ele está lá.

**O texto do aviso não carrega dado de devedor.** Nem telefone, ao contrário da
auditoria do apagamento manual (onde o telefone é o que identifica o registro
que sumiu). Este texto sai por WhatsApp: uma lista de números de devedor
viajando por um gateway não-oficial seria trocar um risco de LGPD por outro
maior. Há um teste só para isso, para alguém pensar duas vezes antes de
acrescentar telefone "para facilitar".

Testes: 685 → **767** (`lib/relatorios-carteira.test.ts` 10, `lib/agendador.test.ts`
10, `lib/retencao.test.ts` 11, `tests/api/relatorios-carteira.test.ts` 22,
`tests/api/agendador.test.ts` 17, mais 12 de janela em `lib/relatorios.test.ts`).

---

## 39. O filtro aceita mais de um, e a planilha sai do recorte

Os relatórios de cobrança (35) e carteira (36) nasceram com dois filtros, e os
dois de escolha única: **uma** carteira ou todas, **uma** equipe ou todas. Na
operação isso não fecha — quem cuida das três carteiras do mesmo cedente somava
três telas na mão. E o número que a gestão persegue o mês inteiro, o que cada
operadora rendeu **carteira por carteira**, não tinha tela nenhuma: os
`GROUPING SETS` davam operadora *ou* carteira, nunca o cruzamento.

O segundo pedido é a saída: um **Excel que obedeça ao filtro montado na tela**,
com abas escolhidas na hora. A decisão 35 registrou a exportação como "cabe, e
não foi feita agora". É agora.

### O SQL era a parte barata

`($3::int IS NULL OR a.carcod = $3::int)` vira
`($3::int[] IS NULL OR a.carcod = ANY($3::int[]))`, e o `pg` serializa um array
JS direto. Oito consultas, uma troca mecânica. `null` continua significando
"todas" — e é o que faz a cláusula **sumir** em vez de virar um `IN` com as 191
carteiras dentro.

O que custou foi a UI, e por um motivo que não estava no plano: o projeto **não
tem Popover, Checkbox nem Command** em `components/ui/`, e o `Select` do Radix
não faz multi-seleção. O caminho canônico entraria com duas dependências para
desenhar uma caixa com checkbox. O padrão já existia pronto em
**`components/salas/trazer-dialog.tsx`** — diálogo com busca, checkbox e ação em
lote —, que é exatamente esta interação e é também o certo pelo tamanho da
lista: 191 carteiras e 353 operadoras não cabem num menu suspenso.

**Zero dependência nova.** `components/relatorios/seletor-multiplo.tsx` serve os
três lugares: relatórios, listas do inventário e Dashboard.

### O tri-estado, e o plural que força a visita

`lib/relatorios-filtros.ts` mata a `codigo()` que estava **copiada byte a byte em
três rotas** — duas cópias da mesma regra já divergiram uma vez neste projeto
(a lista de papéis, 25.1), e o preço foi um papel inalcançável na prática.

Três valores, três significados: `null` = todas · `number[]` = o recorte ·
`undefined` = entrada torta, que vira **400**. Filtro que falha para o lado
permissivo mostra mais do que a pessoa pediu, e ela não tem como perceber.

**Teto de 50 códigos.** Escolher as 191 carteiras já tem nome, e é `null`. O teto
existe para o outro caso: a query string é a superfície pública do relatório, e
sem limite ela é um jeito de mandar um `IN` de dez mil itens contra um banco de
produção a partir da barra de endereços.

Renomear `carteira` → `carteiras` foi de propósito: o compilador apontou os dez
pontos de uso, inclusive os do relógio da decisão 37, em vez de deixar um
sobrevivente comparando número com array.

### Duas armadilhas anotadas onde mordem

**`NULL = ANY(...)` devolve NULL, não `false`.** `d.usucod` pode ser nulo — é o
acordo cujo operador sumiu do cadastro, que os `LEFT JOIN` preservam de propósito
para o TOTAL não encolher em silêncio. Ao filtrar por operadora, esse acordo
**sai**. É o comportamento certo (quem pede "os acordos da Ana" não quer o
órfão), e a consequência está escrita em `FILTRO_PESSOA`: com filtro de operadora
ligado, a soma das partes pode não fechar com o total. A diferença são os órfãos.

**A ordem dos ramos do `CASE` não é decorativa.** O conjunto `(usucod, carcod)`
— a matriz — tem `grouping` zero nas duas colunas. Se o ramo dele não vier
primeiro, ele cai no ramo de `'operadora'` e a matriz inteira é lida como um
ranking com os valores repartidos por carteira: os números somam certo e **o
rótulo mente**.

### O buraco que o pedido não previa

O filtro de operadora é, ele mesmo, um recorte nominal. A decisão 36 nega à
operadora de `COBRANCA` o ranking por operadora — deixar que ela **filtre** por
operadora devolveria o mesmo dado pela porta dos fundos, um pedido por vez, e
ela reconstruiria o ranking inteiro.

O portão é no servidor (403), e não em esconder o seletor: a query string é
editável. A lista de operadoras também não é servida a quem não pode filtrar por
ela — mas isso é cortesia; o portão é o outro.

### Honorário: o nome bonito e o número certo

O pedido dizia "honorários por mês de cada operadora por carteira", e honorário
**não existe como dado validado** em nenhum dos dois projetos:

- `carteira_comissoes` — a tabela que guardaria o % por carteira, com
  `compercomis`/`comperacor`/`comperacio` — está **VAZIA**. `carteira_repasse`
  também. O percentual não é recalculável.
- `usuario.usuperhon` existe e **nunca foi lido** por nada neste sistema.
- `comissao` (133.264 linhas: `comopecod`, `comcarcod`, `comacocod`,
  `comdatpag`, `comvalcom`) tem exatamente a granularidade pedida, e
  `comissao_operadores` (399.792) reparte por tipo — a razão ≈ 3,0 sugere tipo
  fixo. **Nenhum ADR do projeto irmão as tocou.**

Acordos e acionamentos foram conferidos contra os PDFs que o Siscobra imprime
(104/104, 100%). Comissão não foi, por ninguém. Então a medição veio antes:
**`scripts/validar-comissao.ts`** (`npm run db:validar-comissao`), no molde do
`validar-parcelas.ts`.

### E ela derrubou a primeira versão da consulta

Rodado contra o CRM em **18/08/2026**, o script achou o erro que ninguém teria
achado lendo o código:

> **`comissao.comopecod` não é o código da operadora.** São **139.842 valores
> distintos em 139.842 linhas** (faixa 106–2.636.812) e **100% órfãos** em
> `usuario`. É um id sequencial da própria tabela.

`comusuinc` também não serve — 19 valores distintos, todos válidos: é o
back-office que lançou o registro, não quem trabalhou o caso. A operadora está em
**`comissao_operadores.usucod`**: 146 pessoas, nomes reais, 86% casando com o
cadastro.

É a **terceira vez** que este projeto tropeça na mesma armadilha — `acovalatu` e
não `acoval`, `retusucod` e não `acousuinc`, e agora esta. No Siscobra, a coluna
de nome óbvio é a errada, e isso já deixou de ser coincidência: é o padrão.

Mais três medidas que mandaram no desenho:

- **`comopeval` e `comopeper` estão TODOS zerados.** A repartição por
  `comopetipo` que a tabela promete não existe neste banco. O único valor é
  `comvalcom`, da comissão inteira — e é por isso que a aba se chama
  **comissão**, não honorário.
- **São exatamente 3 linhas por comissão** (419.526 / 139.842 = 3,00), e em
  **96,2%** delas é a mesma pessoa (máximo observado: 2). Somar pelo join cru
  triplicaria o dinheiro; daí o `DISTINCT ON (comcod)`. Nos 3,8% restantes o
  valor inteiro é creditado a uma das duas, e isso está na ressalva.
- **14% das comissões** têm `usucod` fora do cadastro e caem em
  "(sem operadora)" — mais em janelas recentes (21,8% no último trimestre).

Conferido depois da correção: `comissaoDe` devolve **8.810 itens e R$ 463.365,28**
num trimestre, exatamente o que `SELECT count(*), sum(comvalcom) FROM comissao`
diz sozinho. Nenhuma multiplicação.

O que o script **não** faz, e continua faltando: comparar um mês com o relatório
que o Siscobra imprime. Até lá, `CONFERIDA = false` em
`lib/relatorios-comissao.ts` mantém a ressalva **colada ao número** — e ela
carrega os números medidos, não uma precaução genérica: ressalva vaga é ruído e a
pessoa aprende a pular.

Colada ao número quer dizer, hoje, **na planilha**: a comissão saiu só como aba,
sem painel próprio. Não é esquecimento — é o selo mandando. Um número que ainda
não bate com o documento oficial não merece uma posição no alternador ao lado de
acordos e carteira, que foram conferidos 104/104. A consulta e a `RESSALVA` já
estão prontas para a tela no dia em que a conferência acontecer.

Foi assim que "em atraso" nasceu na 36 — dizendo "venceu e não achamos a baixa",
e não "não pagou". **Um número com o nome certo vale mais que um número com o
nome bonito.**

Portão: `exigirRelatorio` (admin e supervisor). Comissão é remuneração nominal de
colega, com mais força ainda que o ranking da 35.

### A planilha, e a aba que não é opcional

`lib/excel-relatorios.ts`, 17 abas ligáveis. **"Parâmetros" entra sempre**, mesmo
sem ser pedida: uma planilha de números sem o recorte que os produziu circula por
e-mail e vira um número sem dono. Foi para não ter esse problema que a 23 pôs o
filtro na URL; a planilha não pode desfazê-lo. Ela carrega o recorte **por nome**
("FESTCARD", não "7"), quem exportou, quando, e as ressalvas de método — que são
lidas longe da tela que as explica.

**Duas janelas, e precisam ser duas.** Acordo e comissão olham para TRÁS ("o que
fechou"); a carteira olha para FRENTE ("o que vence"). Uma janela só forçaria uma
das metades a mentir. A capa diz qual vale para quê, e o painel da carteira
remapeia `inicio`/`fim` para `janelaInicio`/`janelaFim` ao montar o link — mandar
cru gravaria data de vencimento como se fosse data de fechamento: nenhum erro, e
um número errado.

**O recorte por papel recusa NOMEANDO a aba** (403: *"Seu perfil não alcança a
aba 'Acordos · operadora'"*), em vez de entregá-la vazia. Vazio silencioso é a
doença que a 30 pagou para aprender. A matriz da 36 sai intacta: supervisor nunca
vê nome de devedor, cobrança nunca vê ranking de colega.

**Fila de três, não `Promise.all`.** O pool do Siscobra é `max: 4`. Oito
consultas em paralelo enfileiram no pool e as últimas estouram o
`connectionTimeoutMillis` de 5s — o erro sairia como "não foi possível consultar
o Siscobra", que manda o TI procurar defeito na rede. Três de cada vez deixa
conexão livre para as **telas**, que continuam sendo usadas enquanto a planilha
é gerada. E `timeout` de 60s, porque ninguém está olhando.

**Uma exportação por usuário.** Duplo clique num botão que demora 40s é o
comportamento normal de quem acha que não funcionou; sem trava, ele dobra a carga
no CRM.

### Dois defeitos antigos que saíram junto

Extrair `lib/excel-estilo.ts` (compartilhado com a planilha do inventário)
deixou dois à vista, e nenhum é opinião:

1. **`lib/excel.ts` não tinha um único `numFmt`.** Valor saía cru ("3450.9") e
   data saía como **texto** — a coluna não ordenava nem filtrava como data no
   Excel (13/08 antes de 02/09, por ordem alfabética). Agora `Date` + `numFmt`,
   mais `autoFilter` no cabeçalho.
2. **`adicionarBlocoIndicador` não contava a linha do "(sem dados)".** A
   aritmética `r += 1 + dados.length + 1` errava quando o bloco vinha vazio, e o
   bloco seguinte escrevia por cima dele. Com o parque cheio isso nunca
   apareceu; num banco recém-instalado, sim. O helper agora devolve a próxima
   linha livre e a conta sumiu de quem chama.

### O Dashboard ganhou filtro, e o escopo continua sendo teto

O painel de Informática nunca teve filtro: os números eram do parque inteiro e o
recorte acontecia depois, no link para a lista. Isso resolve "quais são os sete
sem licença" e não resolve "como está a Sala 93".

A regra que não pode escorregar: o supervisor (24) chega com um recorte imposto
pelo servidor, e a escolha compõe com ele por **AND**, montando
`{ AND: [escopo, escolha] }` — nunca mesclando as chaves num objeto só, porque
`filtroComputador` devolve um `OR` de duas condições e espalhá-lo junto com outro
`OR` faria uma sobrescrever a outra em silêncio. Com OR, o supervisor da Sala 1
digitaria o id da Sala 9 na barra de endereços e o painel obedeceria. Pedir sala
fora do escopo devolve **zero**, que é a resposta certa.

E o filtro **viaja nos links**: `detalhe()` é o funil único dos catorze
indicadores, então aplicar `comFiltro` nele bastou. Sem isso, "Sem licença
Windows: 7" com uma sala filtrada abriria a lista com os sete da empresa — card e
lista discordando, que é o defeito que a 23 resolveu.

Detalhe pequeno com consequência: a lista de **cargos** do seletor sai de uma
consulta própria, e não dos computadores já filtrados. Derivá-la do resultado
faria o seletor encolher a cada escolha — marcado "Operadora", só "Operadora"
sobraria, e não haveria como acrescentar "Gestor" sem limpar o filtro antes.

### O que fica de fora, de propósito

- **Janela maior que 92 dias**, inclusive na exportação. O CRM é produção.
  Consequência aceita e dita na tela: "comissão mês a mês" rende até quatro
  meses por arquivo.
- **Gráficos nativos no Excel.** A decisão 6 continua valendo — `exceljs` não
  escreve chart object.
- **Recuperação e percentuais de conversão.** D-003 e D-005 do projeto irmão
  seguem em pé.
- **Agendar a exportação pelo relógio da 37.** Cabe, e é outra conversa.
- **Tela de comissão** (quarta posição do alternador). Espera a conferência
  contra o relatório impresso — ver acima. Enquanto `CONFERIDA` for `false`, o
  número sai pela planilha, onde a ressalva viaja junto e é lida por quem pediu
  o arquivo, não por quem passou pela tela.

Testes: 807 → **866** (`lib/relatorios-filtros.test.ts` 20,
`lib/filtros-multi.test.ts` 19, `lib/dashboard-filtros.test.ts` 16,
`tests/api/relatorios-exportar.test.ts` 20, mais os de recorte em
`lib/relatorios-carteira.test.ts` e nas duas rotas de relatório).

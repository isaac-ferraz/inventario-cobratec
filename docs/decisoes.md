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

**Decisão:** `loginPadrao` (COB-número), `licencaWindows`, `licencaMicrosoft`
(Microsoft 365 / Office) e `contaOutlook` foram adicionados como campos
opcionais (`String?`) diretamente no model `Computador`.

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

# CLAUDE.md — Sistema de Inventário de Hardware (Cobratec TI)

## Visão geral

Aplicação web interna para o departamento de TI controlar o **hardware de cada computador** do escritório. Cada **funcionário** (operadora, gestor, supervisor, etc.) possui seu próprio computador. O sistema é gerido pelo analista de TI e precisa ser **flexível**: nada de estrutura rígida. As operações principais são adicionar computadores, gerenciar os componentes de hardware de cada um, e realocar computadores entre funcionários.

Não é um SaaS público nem multi-empresa. É uma ferramenta interna, de uso restrito ao TI, rodando na rede do escritório.

## Princípios do projeto

- **Flexibilidade acima de tudo.** O usuário pode adicionar/remover computadores, adicionar/remover/editar qualquer componente de hardware e mover um computador de um funcionário para outro a qualquer momento. Nenhum campo de hardware é fixo ou obrigatório de forma rígida — o catálogo de tipos de componente deve ser editável.
- **Interface simples e interativa.** Telas limpas, ações diretas (botões de adicionar/editar/remover), sem fluxos longos. O gestor de TI precisa fazer alterações rápidas no dia a dia.
- **Dados como fonte única de verdade no banco.** O Excel é um *relatório de saída*, nunca a fonte de dados do site.
- **Decisões técnicas documentadas.** Registrar o "porquê" das escolhas relevantes em `/docs/decisoes.md` (padrão de documentação técnica do TI).

## Stack tecnológica


- **Framework:** Next.js 14+ (App Router) — full-stack, frontend e API no mesmo projeto
- **UI:** shadcn/ui + Tailwind CSS
- **ORM:** Prisma
- **Banco de dados:** SQLite (arquivo local `dev.db`) — simples, zero configuração, um arquivo só
- **Geração de Excel:** biblioteca `exceljs` (gera planilha + gráficos de dashboard no servidor)
- **Linguagem:** TypeScript

> Decisão de arquitetura: SQLite é a fonte de verdade do sistema. O Excel é gerado **sob demanda** a partir do banco, com aba de dados e aba de dashboard. Excel não é usado como banco porque um app interativo com escrita concorrente corromperia o arquivo. Documentar esta decisão em `/docs/decisoes.md`.

## Modelo de dados (Prisma)

O modelo deve ser flexível. Estrutura inicial sugerida — ajustar conforme necessário, mas manter a flexibilidade:

```prisma
// Funcionário = a pessoa dona do computador (operadora, gestor, supervisor, etc.)
model Funcionario {
  id           String       @id @default(cuid())
  nome         String
  cargo        String       // "Operadora", "Gestor", "Supervisor"... texto livre p/ não engessar
  matricula    String?      @unique
  ativo        Boolean      @default(true)
  computadores Computador[]
  criadoEm     DateTime     @default(now())
}

model Computador {
  id            String       @id @default(cuid())
  identificador String       @unique   // ex: patrimônio, hostname ou etiqueta
  apelido       String?
  observacoes   String?
  funcionarioId String?
  funcionario   Funcionario? @relation(fields: [funcionarioId], references: [id])
  componentes   Componente[]
  criadoEm      DateTime     @default(now())
  atualizadoEm  DateTime     @updatedAt
}

// Tipo de componente é um catálogo EDITÁVEL (CPU, RAM, SSD, GPU, Monitor, etc.)
// Permite adicionar tipos novos sem mexer no código.
model TipoComponente {
  id          String       @id @default(cuid())
  nome        String       @unique   // ex: "Memória RAM", "Armazenamento"
  componentes Componente[]
}

model Componente {
  id             String         @id @default(cuid())
  computadorId   String
  computador     Computador     @relation(fields: [computadorId], references: [id], onDelete: Cascade)
  tipoId         String
  tipo           TipoComponente @relation(fields: [tipoId], references: [id])
  descricao      String         // ex: "Kingston 8GB DDR4 2666MHz"
  especificacoes Json?          // campos livres adicionais (capacidade, modelo, etc.) — mantém flexível
  criadoEm       DateTime       @default(now())
}
```

Pontos de flexibilidade obrigatórios:
- Tipos de componente vêm da tabela `TipoComponente` (editável pela UI), não de um enum no código.
- `cargo` é texto livre — não travar em uma lista fixa de cargos.
- `especificacoes Json?` permite campos livres por componente sem migração de schema.
- Remover hardware = deletar o registro `Componente` (não some o computador).
- Mover computador de funcionário = atualizar `funcionarioId`.
- Computador pode ficar sem funcionário (`funcionarioId` null) — ex: máquina em estoque/manutenção.
- Relação 1:N (um funcionário pode ter mais de um computador, um computador tem um dono). Normalmente é 1:1, mas o modelo não impede que um gestor tenha mais de uma máquina.

## Requisitos funcionais

1. **Computadores**
   - Listar todos, com filtro por funcionário e por cargo
   - Adicionar novo computador
   - Editar dados (identificador, apelido, observações)
   - Remover computador (remove os componentes em cascata)
   - Mover computador de um funcionário para outro
2. **Hardware / Componentes**
   - Ver os componentes de um computador
   - Adicionar componente (escolhendo o tipo do catálogo)
   - Editar componente
   - Remover componente
3. **Funcionários**
   - Listar, criar, editar e remover funcionários (com cargo)
   - Marcar funcionário como inativo (ex: desligamento) sem perder o histórico
   - Ao remover/inativar funcionário com computador, decidir destino: bloquear ou liberar o computador para "sem funcionário"
4. **Tipos de componente (catálogo)**
   - CRUD completo dos tipos, para manter o sistema flexível
5. **Exportação Excel** (ver seção própria)

## Saída Excel formal

Endpoint que gera e baixa um `.xlsx` com **duas abas**, a partir dos dados atuais do banco:

1. **Aba "Inventário"** (planilha normal): uma linha por computador (ou por componente, definir na implementação), com colunas: funcionário, cargo, identificador, apelido, e os componentes de hardware. Formatação limpa: cabeçalho em negrito, colunas com largura ajustada, linhas com bordas leves.
2. **Aba "Dashboard"**: os principais indicadores que aparecem no site, com gráficos. Indicadores mínimos:
   - Total de computadores
   - Computadores por cargo (gráfico de barras)
   - Distribuição de componentes por tipo (gráfico de pizza ou barras)
   - Computadores sem funcionário / em estoque
   - Tipos de componente mais comuns

Usar `exceljs` para criar os gráficos nativos do Excel (não imagem estática). O Excel deve refletir exatamente os dados do site no momento da exportação.

## Estrutura de pastas

```
/app
  /api            # rotas de API (computadores, componentes, funcionarios, tipos, export)
  /(rotas de UI)  # páginas
/components       # componentes shadcn/ui e próprios
/lib              # prisma client, helpers, geração de excel
/prisma           # schema.prisma, migrations, dev.db
/docs             # decisoes.md e documentação técnica
```

## Convenções de código

- TypeScript com tipos explícitos nas funções de API
- Componentes de UI pequenos e reutilizáveis
- Toda escrita no banco passa por validação (zod) na camada de API
- Comentários em português, diretos
- Sem dependências desnecessárias — manter o projeto enxuto

## Skills disponíveis em ~/.claude/skills/

Use quando aplicável:
- **frontend-design** — direção visual e de UI ao construir as telas
- **xlsx** — referência para a geração do Excel formal (planilha + dashboard)
- **consultor-mini-app-sqlite** — padrão de mini-app Next.js + Prisma + SQLite + shadcn/ui
- **supabase-postgres-best-practices** — boas práticas de modelagem (parte se aplica a Postgres/Supabase; usar só o que faz sentido para SQLite)

## Comandos úteis

```bash
npx prisma migrate dev      # aplicar mudanças no schema
npx prisma studio           # inspecionar o banco visualmente
npm run dev                 # rodar em desenvolvimento
npm run db:seed             # catálogo + dados de exemplo
npm run db:catalogo         # garante só o catálogo de tipos (idempotente)
npm run db:salas            # garante as salas iniciais (idempotente)
npm run db:admin            # garante um administrador inicial (idempotente)
docker compose up -d --build # subir via Docker (porta 3000, banco em volume)
```

---

## Estado atual do projeto (evoluções além do spec)

Esta seção reflete o que já está implementado, para manter o CLAUDE.md como
especificação viva. Resumo completo em [`docs/RESUMO.md`](./docs/RESUMO.md);
decisões técnicas em [`docs/decisoes.md`](./docs/decisoes.md).

**Implementado:** todo o spec acima (computadores, componentes, funcionários,
catálogo de tipos, Excel com aba Inventário + Dashboard com data bars).

**Celulares:** entidade `Celular` própria, espelhando o computador — CRUD em
`/celulares` + `/api/celulares`, pertence a um funcionário (ou estoque) e pode
ser movido entre eles. Campos: `identificador` (único), `apelido` (modelo),
`numero` (linha), `operadora`, `imei`, `observacoes` — sem componentes. Tem
auditoria, concorrência otimista e busca/filtros, igual ao computador. O delete
de funcionário libera computadores **e** celulares; Dashboard e Excel (aba
"Celulares") refletem os aparelhos (decisão 15 em `decisoes.md`).

**Adições por computador:** além de `observacoes` (texto livre, mantido), cada
computador tem `loginPadrao` (COB-número), `senha` (senha de acesso da máquina),
`licencaWindows`, `licencaMicrosoft` (Microsoft 365/Office) e `contaOutlook` —
todos campos diretos do `Computador` (decisão 8 em `decisoes.md`).

**Credenciais do funcionário:** a antiga `matricula` foi substituída por
`loginSiscobra`/`senhaSiscobra` e `loginVonix`/`senhaVonix` (campos diretos do
`Funcionario`, opcionais). Senhas em texto puro (cofre interno de TI; decisão 8). Há também os **periféricos** `temMouse`,
`temTeclado` e `temHeadset` — booleans de presença (sem modelo); mouse e teclado
com default `true`, headset `false` (decisão 10 em `decisoes.md`).

**Salas (divisão física do escritório):** modelo `Sala` como catálogo editável
(`/salas` + `/api/salas`), com `nome` único, `predio`/`piso` (texto livre),
`ordem`, `ativa` e `observacoes`. `salaId` opcional no **Computador** (onde a
máquina está — vale para estoque) e no **Funcionário** (onde a pessoa senta); o
formulário do computador sugere a sala do dono ao vinculá-lo. Celular não tem
sala (anda com a pessoa). Sala em uso não é removível (409) — use "desativar".
Filtros por sala nas listas, coluna no Excel, bloco "Computadores por sala" e
pendência "Sem sala definida" no Dashboard. As 4 salas iniciais vêm de
`prisma/salas.cjs` por seed idempotente no boot (decisão 18 em `decisoes.md`).

Cada sala tem **página própria** (`/salas/[id]`) com tudo que foi levado para
ela, agrupado por **posto de trabalho** (funcionário + seus computadores +
celulares), mais a seção "computadores nesta sala sem posto" (estoque ou
máquina de alguém de outra sala). Divergência pessoa×máquina é sinalizada no
posto. A movimentação usa `POST /api/salas/mover` — trazer para cá, tirar daqui
e mandar para outra sala, item a item ou em lote com seleção múltipla,
transacional e com auditoria origem→destino por item (decisão 18.1).

**Depósito (estoque de suprimentos):** aba `/deposito` + `/api/deposito` com o
modelo `ItemDeposito` (nome, `categoria` texto livre, `quantidade`,
`quantidadeMinima`, `localizacao`, `observacoes`). Controle de estoque por
quantidade para itens avulsos em caixas (cabos, mouses...): KPIs de tipos/
unidades/em falta/estoque baixo, contagem rápida com botões **±** (`PATCH
{ delta }`, atômico, piso em 0, sem auditoria) e situação derivada (falta/baixo/
ok). Decisão 17 em `decisoes.md`.

**Melhorias de UX/dados:** busca na lista de computadores; filtros por
funcionário e cargo; funcionários inativos fora do seletor de dono; validação de
e-mail (conta Outlook) na API; limpar campos opcionais via edição (`"" → null`);
**pendências de licença/conta** no Dashboard e no Excel.

**Robustez e integridade:** carregamento das telas checa `res.ok` (helper
`lib/fetcher.ts`) e mostra erro com "Tentar novamente" em vez de quebrar; SQLite
em **modo WAL** + **índices de FK** (decisão 11); **concorrência otimista** na
edição de computador via `esperaAtualizadoEm` (decisão 12); delete de funcionário
transacional; **limites de tamanho** (zod) nas entradas.

**Auditoria:** trilha append-only (`LogAuditoria`) das mutações (criar/editar/
remover/mover) das quatro entidades, com ator (via sessão), API
`GET /api/auditoria` e tela `/auditoria`; registro best-effort, fora da transação
(decisão 13). Eventos podem ser apagados manualmente pelo TI
(`DELETE /api/auditoria/:id`, botão na tela).

**Qualidade/processo:** **testes** com vitest em duas frentes — funções puras
(`lib/*.test.ts`) e **rotas de API contra um SQLite descartável**
(`tests/api/*.test.ts`): 401/403/404, revogação de acesso, nota interna filtrada,
travas do último admin e 409 de concorrência. **ESLint** configurado; **CI** no
GitHub Actions (lint + testes + build em push/PR para `main` e `develop`).

**Polimento (fase 5, decisões 22–23):**
- **Toast e confirmação próprios** (`components/ui/toast.tsx`,
  `confirmar-dialog.tsx`) no lugar de `alert()`/`confirm()` nativos. A
  confirmação devolve `Promise<boolean>`, então cada uso cabe em uma linha.
- **Paginação** só onde a lista cresce sem teto — chamados, manutenções e
  auditoria (`lib/paginacao.ts` + `hooks/use-lista-paginada.ts`). Totais e KPIs
  vêm do servidor sobre o conjunto inteiro, nunca da página carregada.
- **Tema claro/escuro** com três estados (claro/escuro/sistema), provider próprio
  e script anti-flash no `<head>`. Pares de cor de estado vivem em classes
  semânticas (`.tom-alerta`, `.tom-ok`, `.num-alerta`…) em `globals.css`.
- **Backup agendado**: rotação por `BACKUP_DIAS`, recusa de backup vazio e
  cron/systemd prontos em [`docs/backup.md`](./docs/backup.md).

**Interatividade (decisão 23):** os filtros das telas vivem na **URL**
(`hooks/use-filtro-url.ts`), o que torna todo número do Dashboard um link para a
lista naquele recorte — KPIs, barras (cargo, sala, tipo de componente) e cards de
pendência. As pendências são um catálogo único (`lib/pendencias.ts`) usado tanto
para contar quanto para filtrar, para o card e a lista nunca discordarem. O nome
do funcionário virou link para **`/funcionarios/[id]`**, o perfil com
computadores (e hardware), celulares, credenciais e chamados da pessoa.

**Marca:** logo oficial da Cobratec (símbolo + wordmark vetorizados em
`components/brand/`) na navegação e no login; o token `--brand-blue` clareia
sozinho no tema escuro.

**Supervisor de sala (decisão 24):** papel `SUPERVISOR` ligado a quantas salas
precisar (`SupervisorSala`; cada sala tem quantos supervisores precisar). As
regras de alcance são funções puras em **`lib/supervisao.ts`**, e os filtros
entram no `where` do Prisma — a consulta sai recortada do banco, não da memória.
Um computador é "da sala" quando a **máquina** está nela **ou** o **dono** senta
nela; celular segue o dono. `exigirEscopo` (em `lib/autorizacao.ts`) é o portão
do inventário, ao lado de `exigirSessao` e `exigirAdmin`. Continuam só com o TI:
cadastrar/remover registros, catálogo de tipos, depósito, usuários, auditoria e
exportação. No helpdesk o supervisor vê os chamados da sala mas age como
operador (a fila é do TI, e a nota interna não é dele).

**Rodada de caça a bugs (decisão 25):** varredura no navegador + API achou e
corrigiu oito defeitos. O mais grave: o login assinava o cookie de um
**SUPERVISOR como OPERADOR**, e como o middleware julga a navegação só pelo
cookie (roda no Edge), o papel da decisão 24 era **inalcançável na prática** — a
conversão virou `papelDe()` em `lib/supervisao.ts`, ponto único usado pelo login e
pela releitura server-side. Os outros: data inexistente no calendário (`2026-13-01`
dava 500; `2026-02-31` era gravada calada como 03/03), admin conseguia **inativar
a própria conta** e se trancar fora, o ajuste ± do depósito ignorava o teto de
estoque, login sem freio de força bruta (agora `lib/rate-limit.ts`, 10 erros/5 min
por IP+login), **CSP** entrou revendo a decisão 9, mensagens do zod em inglês
viraram pt-BR (`lib/zod-ptbr.ts`) e a movimentação de sala não mais responde "ok"
para id inexistente. Cobertura foi de 177 para 244 testes, incluindo os dois
arquivos que faltavam: `tests/api/sessao.test.ts` (papel gravado no cookie) e
`tests/api/middleware.test.ts` (portão de navegação, papel por papel).

**Importação de CSV (decisão 26):** carga em massa nas sete entidades
(funcionários, computadores, celulares, depósito, tipos, salas, usuários) via
`POST /api/importar` + o diálogo único `components/importar-csv.tsx` no cabeçalho
de cada tela; só admin. **A validação não é duplicada:** `lib/importacao.ts`
converte a linha e entrega ao **mesmo schema zod da tela**, então data do
calendário, "1.234,90", e-mail e tetos vêm de graça. Relação vem **por nome**
("Ana Souza", "Sala 93") e nome ambíguo é recusado em vez de adivinhado. Fluxo em
duas fases: **prévia** linha por linha sem escrever, depois transação
tudo-ou-nada (com opção de "só as linhas válidas"). **Célula vazia não apaga** o
que já está gravado. `lib/csv.ts` é parser próprio para o CSV do Excel-BR
(delimitador `;`, BOM, CRLF, aspas), com modelo para baixar por entidade.
Componentes, chamados e manutenções ficaram de fora de propósito.

**Papel de cobrança e `/chat` (decisão 27):** a Cobratec é empresa de cobrança, e
o atendimento ao devedor por WhatsApp passa a morar aqui — um **segundo ofício**
dentro do app, com dado pessoal de terceiro que o inventário nunca teve. Papel
`COBRANCA` separado (não operador com flag: senão todo operador de helpdesk
herdaria a porta do dado do devedor). Ela entra em `/chat` — bloco destacado
fora da lista de navegação, porque para quem atende é a única porta que importa
— e **não enxerga inventário nenhum**, nem o dashboard; leva só o que o operador
tem (abrir chamado, trocar a senha). O **supervisor de sala fica de fora** das
conversas de propósito: alcance sobre dado de devedor se decide pelo ofício, não
pela sala — por isso nada em `lib/supervisao.ts` se ramifica para `COBRANCA`, e o
alcance extra vive em `exigirChat` (`lib/autorizacao.ts`), espelhado por
`PERMITIDO_COBRANCA` (middleware) e `podeChat` (nav). `Usuario.siscobraUsucod` é
o código da operadora no Siscobra (CRM, PostgreSQL **somente leitura**): `Int?`
solto e não relação, porque é outro banco; anda **colado ao papel** nos três
caminhos de escrita (POST, PATCH e importação) — sair de `COBRANCA` zera. A tela
`/chat` está em **fase 0**: portão e lugar prontos, serviço de WhatsApp e dossiê
do Siscobra ainda por ligar.

**Chatbot de cobrança (decisão 28):** o `/chat` da decisão 27 ganhou serviço.
Modelos `Conversa` (telefone como identidade, `situacao` bot|fila|humana|
encerrada, `siscobraDevcod`/`identificadaEm`, `dossie` JSON em texto) e
`ConversaMensagem` (autor devedor|bot|operadora|sistema, `waId` UNIQUE).
Fronteiras: **n8n é o chatbot** (classifica → consulta Siscobra → redige →
decide escalar), **WAHA** é o gateway (Docker, `docker-compose.waha.yml`), e o
inventário **não abre conexão com o Siscobra nem com o WhatsApp** — o dossiê
chega empurrado pelo webhook e fica congelado como prova do que a operadora
tinha à frente. As regras vivem em **funções puras** em `lib/conversas.ts`:
nenhum valor antes de CPF **e** nascimento (`podeRevelarValores` — código, não
prompt), nenhuma proposta fora da regra oficial da carteira
(`propostaCabeNaRegra`), e a situação **só anda para frente** (de `humana` não
volta para `bot`). Ao responder, **entrega primeiro e grava depois**: mensagem
fantasma é pior que mensagem repetida. `exigirServico` (token, não sessão) é o
portão do n8n, e `/api/chat/webhook` é público no middleware por **caminho
exato**. Guia de ligação, SQL do Siscobra e prompts em
[`docs/conversas/`](./docs/conversas/README.md).

**Modo direto do WhatsApp (decisão 29):** dá para **conectar um número e
conversar sem o n8n** — sem Twilio e sem API oficial da Meta. É o caminho de
**teste**, ligado só por `WAHA_URL` no `.env`; `CHAT_ENVIO_URL` (n8n) tem
precedência, senão uma variável esquecida silenciaria o chatbot inteiro. O
pareamento é um QR na tela **`/chat` → Conexão** (`app/chat/conexao`, só admin;
a rota `/api/chat/conexao` fala com o gateway por `lib/waha.ts`). A fronteira da
decisão 28 continua: **nada de Siscobra aqui**, e o dossiê segue empurrado — o
que encurta é só o trecho do canal. Sem robô do outro lado, toda mensagem entra
**escalada** e cai na fila. As duas portas de webhook (`/api/chat/webhook`, do
n8n, e `/api/chat/waha/webhook`, do gateway) dividem a mesma máquina de estados
em **`lib/chat-registro.ts`** e o mesmo `CHAT_SERVICE_TOKEN` — o WAHA manda o
`Authorization` porque a sessão é criada pelo próprio app, com `customHeaders`.
Não viram conversa: eco da própria resposta (`fromMe`), grupo e broadcast — tudo
responde 200 "ignorado", porque recusar faria o gateway reentregar para sempre.
**Risco dito em voz alta:** gateway não-oficial contraria os termos do WhatsApp
e o número pode ser banido — chip dedicado.

**Anexo e fila ao vivo (decisão 30):** o primeiro teste com gente de verdade
expôs que o filtro descartava **em silêncio** — o gateway entregava, o app
respondia 200 e não havia rastro. Agora todo evento ignorado grava o motivo, sem
conteúdo nem número (LGPD). **Mídia entra**: áudio, foto e PDF viram mensagem com
marcador (`[áudio]`) e o arquivo é baixado depois, **fora do banco**, ao lado do
`dev.db`; falha de download não derruba a fala, e servir passa pelo mesmo portão
da conversa (`exigirChat`), com a mensagem amarrada ao id da conversa. Endereço
do download só da origem do gateway (SSRF), nome do arquivo derivado do id da
mensagem (nunca o nome que veio do WhatsApp). Remetente em **LID** (`@lid`, o
novo endereçamento do WhatsApp) tem o telefone procurado nos campos vizinhos —
não havendo, ignora e registra, porque LID no lugar do telefone criaria uma
segunda conversa da mesma pessoa. A **fila é ao vivo** por SSE
(`/api/chat/eventos`) sobre um barramento de processo (`lib/chat-eventos.ts`) —
sem Redis, e o limite de uma-instância-só está dito lá; a consulta periódica
continua como rede de segurança (60s com o canal vivo, 15s sem ele) e a tela diz
qual dos dois está valendo. Fluxos do n8n prontos para importar em
[`docs/conversas/n8n/`](./docs/conversas/n8n/).

**Robô local de triagem (decisão 31):** o modo direto ganhou um cérebro que roda
**na própria máquina** (Ollama), ligado só por `OLLAMA_URL` — vazio mantém tudo
caindo na fila, o comportamento da decisão 29. Local porque conversa de devedor
não sai da empresa; o preço é caber um modelo de 1B–3B em CPU, e é daí que vem o
desenho. Medindo com `llama3.2:1b`, "já paguei" recebeu **"Não, ainda não"** e
"advogado" fez o modelo **inventar um telefone** — não é falha de prompt, é o
tamanho do modelo. Então a ordem se inverteu: **o código decide o que é
perigoso** (`assuntoExigeGente` manda dívida, pagamento, menção jurídica, dado
pessoal, contestação e pergunta operacional para a fila **sem** consultar o
modelo) e o robô só atende o que sobra — saudação, "quem é você". Depois de
pronta, a resposta ainda passa por `avaliarResposta`, que barra cheiro de valor,
telefone, promessa de atendente sem escalar e eco do formulário; **`escalar`
ausente escala**, porque a decisão perigosa não pode ser a que acontece quando o
modelo entende menos. Toda saída que não é "respondeu" termina em **escalar,
nunca em silêncio**. O robô fala **por último** (grava → fila pisca → pensa) e
`escalarConversa` filtra por `situacao: "bot"` no `updateMany`, então ele nunca
tira conversa de quem já assumiu. Continua **sem Siscobra**: é o degrau entre
"ninguém responde" e o chatbot da decisão 28. Regras puras em `lib/chat-bot.ts`.

**Modelo no Colab (decisão 31.1):** quando a máquina não aguenta o modelo, o
notebook [`docs/conversas/colab/`](./docs/conversas/colab/ollama-colab.ipynb)
sobe o Ollama numa GPU do Colab, **mede** as falas típicas contra o teto de 45s
e imprime as linhas do `.env`. É **caminho de teste**: modelo fora da rede
significa que a fala do devedor sai da empresa, que é o que a decisão 31
recusou. O desenho não impede, mas não deixa invisível — `ehLocal()` decide se o
endereço é alcançável da internet (na dúvida responde "fora") e a tela
`/chat → Conexão` avisa em vermelho. O túnel não expõe o Ollama direto, que não
tem autenticação nenhuma: um proxy exige `OLLAMA_TOKEN` e libera só duas rotas.

**Infra:**
- **Excel:** o dashboard usa *data bars* (formatação condicional), porque o
  `exceljs` não cria gráficos nativos na escrita (decisão 6).
- **Docker:** imagem enxuta com Next `output: "standalone"`, multi-stage Alpine,
  usuário não-root; `docker-compose` com volume persistente (`/app/data`) e
  **healthcheck** (`/api/health`); migrations + WAL aplicados no boot pelo
  `docker-entrypoint.sh`. Backup com `npm run db:backup` (`VACUUM INTO`).
- **Catálogo sempre presente:** `prisma/seed-catalogo.cjs` (lista única em
  `prisma/catalogo.cjs`) roda a cada boot do container, garantindo o catálogo de
  tipos sem precisar rodar o seed manualmente.
- **Segurança/dependências:** **login obrigatório com papéis** (ver abaixo);
  **headers de segurança** em todas as respostas; Next fixado na linha 14.2.x
  (14.2.35). A antiga auth Basic opcional foi removida (decisões 9 e 19).

**Autenticação e papéis (decisões 19, 24 e 27):** o sistema **exige login**. Model
`Usuario` (login único, `senhaHash` scrypt, papel
`ADMIN`|`SUPERVISOR`|`COBRANCA`|`OPERADOR`, `ativo`, `senhaProvisoria`, vínculo
opcional com `Funcionario` e `siscobraUsucod`) + CRUD em `/usuarios` (só
admin). **Administrador** faz tudo; **supervisor de sala** vê e edita o que está nas
salas dele (inclusive o cofre de senhas da equipe) e não alcança as telas globais;
**cobrança** alcança as conversas (`/chat`) e nada do inventário;
**operador** só alcança `/chamados` e `/trocar-senha`. A lista de papéis vive em
um lugar só (`PAPEIS`/`papelDe`, em `lib/supervisao.ts`) e é importada pelo
cookie, pelo login e pela releitura — duas cópias dela já divergiram uma vez
(decisão 25.1). Sessão em cookie httpOnly assinado por HMAC (`lib/sessao.ts`,
Web Crypto — funciona no Edge do middleware), com **reconferência no banco** em
`lib/sessao-servidor.ts` (papel e `ativo` valem os do banco, não os do cookie).
Autorização em duas camadas: `middleware.ts` (portão de navegação) **e**
`exigirSessao`/`exigirAdmin` (`lib/autorizacao.ts`) no início de cada rota de
API — nenhuma rota confia só no middleware. `AUTH_SECRET` é **obrigatório** (o
app e o entrypoint recusam subir sem ele). Admin inicial idempotente em
`prisma/seed-admin.cjs`; senha definida por terceiro nasce provisória e a troca
é cobrada no primeiro acesso. Travas: não dá para rebaixar/inativar/remover o
último admin ativo, nem remover a própria conta.

**Chamados / helpdesk (decisão 20):** `/chamados` + `/chamados/[id]` e
`/api/chamados*`. Modelos `Chamado` (numero sequencial calculado em transação,
titulo, descricao, categoria, prioridade, status, solicitante, responsável,
equipamento e sala opcionais) e `ChamadoMensagem` (com `interna`). As regras
(visibilidade, transições de status, campos exclusivos do admin) vivem em
**funções puras** em `lib/chamados.ts`, cobertas por testes. Operador: abre,
responde, fecha o próprio quando resolvido e reabre — **não** define prioridade,
responsável nem andamento. Chamado alheio responde **404** (não confirma que
existe). Nota interna é filtrada **no servidor**, antes de virar JSON.
`/api/chamados/contexto` devolve só os equipamentos do próprio solicitante.
Dashboard ganhou KPIs de suporte (em aberto, sem responsável, resolvidos em 7
dias, mais antigo).

**Ciclo de vida do ativo (decisão 21):** `Computador` e `Celular` ganharam
`situacao` (`ativo|manutencao|reserva|descartado`), `dataAquisicao`,
`notaFiscal`, `garantiaAte` e `valorCompra`; e existe o model `Manutencao`
(tipo corretiva/preventiva, descrição, fornecedor, custo, `abertaEm`,
`concluidaEm`, vínculo com o equipamento e com o chamado que originou). Tela
`/manutencoes` + `/api/manutencoes`. **Estado × evento:** `situacao` diz onde o
equipamento está hoje; `Manutencao` guarda o histórico — abrir/concluir/apagar
mexe na situação **na mesma transação**, com regras puras e testadas em
`lib/ativos.ts` (não ressuscita descartado; concluir não desfaz decisão tomada
durante o conserto). Garantia avisa só quando acionável (janela de 90 dias).
Datas gravadas ao meio-dia UTC (fuso do Brasil leria o dia anterior); valores
aceitam "3.450,90". Reflexo em filtros, badges, Dashboard e Excel (aba
"Manutenções").

**Repositório:** GitHub privado `isaac-ferraz/inventario-cobratec`. Branches:
`main` (estável), `develop` (integração), `feat/docker` (Docker + catálogo).

**Observação sobre as skills citadas acima:** `xlsx` e
`consultor-mini-app-sqlite` não estavam instaladas no ambiente; o projeto foi
construído sem elas.

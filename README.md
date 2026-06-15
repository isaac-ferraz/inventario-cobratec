# Inventário Cobratec — Sistema de Inventário de Hardware (TI)

Aplicação web **interna** para o departamento de TI da Cobratec controlar o
hardware de cada computador do escritório: cadastro de máquinas, componentes de
hardware, funcionários (donos), login/licenças/conta por máquina, dashboard de
indicadores e exportação de um relatório Excel formal.

Não é SaaS público nem multiempresa — é uma ferramenta de uso restrito ao TI,
para rodar na rede do escritório. O banco SQLite é a **fonte única de verdade**;
o Excel é apenas um relatório de saída gerado sob demanda.

---

## Sumário

- [Stack](#stack)
- [Arquitetura](#arquitetura)
- [Modelo de dados](#modelo-de-dados)
- [Funcionalidades](#funcionalidades)
- [Referência da API](#referência-da-api)
- [Validação (zod)](#validação-zod)
- [Exportação Excel](#exportação-excel)
- [Dashboard](#dashboard)
- [Estrutura de pastas](#estrutura-de-pastas)
- [Pré-requisitos](#pré-requisitos)
- [Setup](#setup)
- [Rodar](#rodar)
- [Scripts](#scripts)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Convenções de código](#convenções-de-código)
- [Decisões técnicas](#decisões-técnicas)
- [Segurança e acesso](#segurança-e-acesso)
- [Branches](#branches)
- [Roadmap / melhorias futuras](#roadmap--melhorias-futuras)

---

## Stack

| Camada       | Tecnologia                                              |
| ------------ | ------------------------------------------------------- |
| Framework    | **Next.js 14** (App Router) — frontend + API no projeto |
| Linguagem    | **TypeScript**                                          |
| UI           | **shadcn/ui** (escrito à mão em `components/ui`) + **Tailwind CSS** |
| ORM          | **Prisma**                                              |
| Banco        | **SQLite** (arquivo `prisma/dev.db`)                    |
| Validação    | **zod** (na camada de API)                              |
| Excel        | **exceljs** (planilha + dashboard com data bars)        |
| Ícones       | **lucide-react**                                        |

---

## Arquitetura

- **Full-stack num projeto só**: as páginas (UI) e as rotas de API vivem em
  `app/`, servidas pelo Next.js.
- **SQLite = fonte de verdade.** Toda leitura/escrita passa pelo Prisma. O Excel
  nunca é a fonte — é gerado a partir do banco no momento da exportação.
- **Validação na borda.** Toda escrita na API é validada com zod antes de tocar
  o banco; erros do Prisma são traduzidos para mensagens amigáveis.
- **Páginas de dados read-only** (Dashboard) são Server Components que leem
  direto do Prisma; as telas de CRUD são Client Components que consomem a API e
  recarregam a lista após cada mutação.

---

## Modelo de dados

Definido em [`prisma/schema.prisma`](./prisma/schema.prisma). O modelo prioriza
**flexibilidade**: nada de enums fixos no código para tipos ou cargos.

### `Funcionario` — dono do computador

| Campo          | Tipo       | Notas                                            |
| -------------- | ---------- | ------------------------------------------------ |
| `id`           | String     | cuid, PK                                         |
| `nome`         | String     | obrigatório                                      |
| `cargo`        | String     | **texto livre** (Operadora, Gestor, Supervisor…) |
| `matricula`    | String?    | opcional, único                                  |
| `ativo`        | Boolean    | default `true`; inativar preserva histórico      |
| `computadores` | Computador[] | relação 1:N                                    |
| `criadoEm`     | DateTime   | default now                                      |

### `Computador`

| Campo              | Tipo        | Notas                                       |
| ------------------ | ----------- | ------------------------------------------- |
| `id`               | String      | cuid, PK                                    |
| `identificador`    | String      | **único** — patrimônio, hostname ou etiqueta |
| `apelido`          | String?     | opcional                                    |
| `observacoes`      | String?     | opcional                                    |
| `loginPadrao`      | String?     | login padrão da máquina, ex: `COB-1024`     |
| `licencaWindows`   | String?     | chave/observação da licença do Windows      |
| `licencaMicrosoft` | String?     | licença Microsoft 365 / Office              |
| `contaOutlook`     | String?     | conta do Outlook corporativo (e-mail)       |
| `temMouse`         | Boolean     | periférico presente (default `true`)        |
| `temTeclado`       | Boolean     | periférico presente (default `true`)        |
| `temHeadset`       | Boolean     | periférico presente (default `false`)       |
| `funcionarioId`    | String?     | **null = sem dono** (estoque/manutenção)    |
| `componentes`      | Componente[] | hardware (cascade ao remover o computador) |
| `criadoEm`         | DateTime    | default now                                 |
| `atualizadoEm`     | DateTime    | `@updatedAt`                                |

### `TipoComponente` — catálogo editável

| Campo         | Tipo        | Notas                                       |
| ------------- | ----------- | ------------------------------------------- |
| `id`          | String      | cuid, PK                                    |
| `nome`        | String      | **único** (CPU, RAM, SSD, Monitor…)         |
| `componentes` | Componente[] | relação                                    |

### `Componente` — uma peça de hardware

| Campo            | Tipo     | Notas                                                     |
| ---------------- | -------- | --------------------------------------------------------- |
| `id`             | String   | cuid, PK                                                  |
| `computadorId`   | String   | FK, **onDelete: Cascade**                                 |
| `tipoId`         | String   | FK para `TipoComponente`                                  |
| `descricao`      | String   | ex: "Kingston 8GB DDR4 2666MHz"                           |
| `especificacoes` | String?  | **JSON livre serializado em texto** (chave/valor)         |
| `criadoEm`       | DateTime | default now                                               |

> **Por que `especificacoes` é texto e não Json?** O Prisma sobre SQLite não
> suporta o tipo `Json`. Guardamos o JSON serializado e (de)serializamos na
> camada de API (`lib/especificacoes.ts`), mantendo a flexibilidade de campos
> livres por componente.

---

## Funcionalidades

**Computadores**
- Listar com **busca** (identificador, apelido, login, conta, nome do dono) e
  filtros por funcionário e por cargo.
- Criar, editar (identificador, apelido, observações), remover (remove os
  componentes em cascata).
- **Mover** computador entre funcionários (trocar o dono no formulário).
- Computador pode ficar **sem funcionário** (estoque/manutenção).
- Registrar **login padrão, licença Windows, licença Microsoft e conta Outlook**
  por máquina.
- Marcar os **periféricos** que acompanham a máquina (mouse, teclado, headset) —
  só presença, sem modelo; mouse/teclado vêm marcados por padrão.

**Hardware / Componentes**
- Ver, adicionar, editar e remover componentes de cada computador.
- Escolher o **tipo** do catálogo e preencher **especificações livres**
  (chave/valor) sem migração de schema.

**Funcionários**
- CRUD completo, cargo como texto livre.
- **Inativar** (ex: desligamento) preservando o histórico.
- Ao remover funcionário com computador: a API bloqueia por padrão e exige
  confirmação para **liberar** as máquinas para "sem funcionário".
- Funcionários inativos não aparecem no seletor de "dono" (mas o dono atual de
  uma máquina continua visível na edição, marcado como inativo).

**Tipos de componente**
- CRUD completo do catálogo. Não deixa remover tipo que está em uso.

**Dashboard**
- KPIs, distribuição por cargo e por tipo, e **pendências de licença/conta**.

**Exportação Excel**
- `.xlsx` com aba de **Inventário** e aba de **Dashboard**.

---

## Referência da API

Todas as rotas ficam em `app/api`. Respostas e erros em JSON
(`{ "erro": "mensagem" }` nos casos de falha).

### Funcionários

| Método | Rota                          | Descrição                                                   |
| ------ | ----------------------------- | ----------------------------------------------------------- |
| GET    | `/api/funcionarios`           | Lista (com contagem de computadores)                        |
| POST   | `/api/funcionarios`           | Cria                                                        |
| PATCH  | `/api/funcionarios/{id}`      | Edita (parcial)                                             |
| DELETE | `/api/funcionarios/{id}`      | Remove; `?liberar=1` solta os computadores antes de remover |

### Computadores

| Método | Rota                                   | Descrição                                          |
| ------ | -------------------------------------- | -------------------------------------------------- |
| GET    | `/api/computadores`                    | Lista; filtros `?funcionarioId=` (`sem` = estoque) e `?cargo=` |
| POST   | `/api/computadores`                    | Cria                                               |
| GET    | `/api/computadores/{id}`               | Detalha (com funcionário e componentes)            |
| PATCH  | `/api/computadores/{id}`               | Edita / **move** (basta enviar `funcionarioId`)    |
| DELETE | `/api/computadores/{id}`               | Remove (componentes em cascata)                    |

### Tipos de componente

| Método | Rota                | Descrição                                  |
| ------ | ------------------- | ------------------------------------------ |
| GET    | `/api/tipos`        | Lista (com contagem de uso)                |
| POST   | `/api/tipos`        | Cria                                       |
| PATCH  | `/api/tipos/{id}`   | Edita                                      |
| DELETE | `/api/tipos/{id}`   | Remove (bloqueado se o tipo estiver em uso) |

### Componentes

| Método | Rota                     | Descrição                  |
| ------ | ------------------------ | -------------------------- |
| POST   | `/api/componentes`       | Cria componente de um PC   |
| PATCH  | `/api/componentes/{id}`  | Edita                      |
| DELETE | `/api/componentes/{id}`  | Remove                     |

### Exportação

| Método | Rota          | Descrição                                          |
| ------ | ------------- | -------------------------------------------------- |
| GET    | `/api/export` | Baixa o `.xlsx` (dynamic, sempre dados atuais)     |

---

## Validação (zod)

Em [`lib/validations.ts`](./lib/validations.ts). Regras dos campos de texto
opcionais:

- **ausente** (não enviado) → não altera o campo (importante no PATCH parcial);
- **string vazia (`""`)** → grava `null` (permite **limpar** pela edição);
- **texto** → o próprio valor.

`contaOutlook` é validada como e-mail quando preenchida. `identificador`,
`nome`, `cargo`, `descricao` e nome de tipo são obrigatórios.

---

## Exportação Excel

Gerada em [`lib/excel.ts`](./lib/excel.ts) com **exceljs**:

- **Aba "Inventário"** — uma linha por computador: identificador, apelido,
  funcionário, cargo, status, login padrão, conta Outlook, licença Windows,
  licença Microsoft, periféricos (mouse/teclado/headset — Sim/Não), qtde de
  componentes, lista de hardware e observações.
  Cabeçalho em negrito, colunas ajustadas, bordas leves, cabeçalho congelado.
- **Aba "Dashboard"** — KPIs + blocos de "Computadores por cargo", "Componentes
  por tipo" e "Pendências de licença/conta", com **barras de dados (data bars)**.

> **Limitação conhecida:** o exceljs **não cria gráficos (chart objects) nativos
> na escrita** — apenas lê. Por isso o dashboard usa **data bars** via formatação
> condicional, que são nativas do Excel (não imagem estática) e atualizam com a
> célula. Detalhe em [`docs/decisoes.md`](./docs/decisoes.md).

---

## Dashboard

Indicadores (os mesmos do Excel):

- Total de computadores, em uso, sem funcionário/estoque, tipos distintos.
- Computadores por cargo (barras).
- Componentes por tipo (barras).
- Pendências: PCs sem licença Windows / sem Microsoft / sem Outlook / sem login /
  sem headset.

---

## Estrutura de pastas

```
.
├── app/
│   ├── api/
│   │   ├── componentes/{route, [id]/route}.ts
│   │   ├── computadores/{route, [id]/route}.ts
│   │   ├── funcionarios/{route, [id]/route}.ts
│   │   ├── tipos/{route, [id]/route}.ts
│   │   └── export/route.ts
│   ├── computadores/page.tsx
│   ├── funcionarios/page.tsx
│   ├── tipos/page.tsx
│   ├── layout.tsx          # shell + navegação
│   ├── page.tsx            # Dashboard
│   └── globals.css
├── components/
│   ├── ui/                 # button, card, dialog, select, table, input, etc.
│   └── export-button.tsx
├── lib/
│   ├── prisma.ts           # cliente Prisma singleton
│   ├── validations.ts      # schemas zod
│   ├── api.ts              # helpers de resposta/erro
│   ├── especificacoes.ts   # (de)serialização do JSON livre
│   ├── excel.ts            # geração do .xlsx
│   └── utils.ts            # cn()
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts             # catálogo + dados de exemplo
│   └── migrations/
├── docs/
│   └── decisoes.md         # registro de decisões técnicas
├── CLAUDE.md               # especificação de produto
└── README.md
```

---

## Pré-requisitos

- **Node.js 20+** (testado em Node 24)
- **npm**

---

## Setup

```bash
npm install              # instala dependências e gera o Prisma Client
npx prisma migrate dev   # cria/atualiza o SQLite e aplica as migrations
npm run db:seed          # (opcional) catálogo de tipos + dados de exemplo
```

O `.env` define `DATABASE_URL="file:./dev.db"`.

---

## Rodar

```bash
npm run dev                   # desenvolvimento em http://localhost:3000
# ou
npm run build && npm start    # produção
```

### Rodar com Docker

Imagem **enxuta** via build multi-stage + output `standalone` do Next, sobre
Alpine. O banco SQLite é persistido em um **volume** (`inventario-db`) e as
migrations são aplicadas automaticamente no start (`prisma migrate deploy`).

```bash
docker compose up -d --build      # build + sobe em http://localhost:3000
docker compose logs -f app        # acompanhar logs
docker compose down               # parar (mantém o volume/banco)
docker compose down -v            # parar e APAGAR o banco do volume
```

Detalhes:

- **Persistência:** o `dev.db` fica no volume `inventario-db` montado em
  `/app/data`; sobrevive a `down`/rebuilds. `DATABASE_URL` aponta para o caminho
  absoluto `file:/app/data/dev.db`.
- **Migrations:** aplicadas no boot do container pelo `docker-entrypoint.sh`.
- **Catálogo de tipos sempre presente:** o entrypoint roda
  `prisma/seed-catalogo.cjs` (idempotente) a cada boot, garantindo o catálogo
  padrão de tipos de componente — sem precisar rodar o seed manualmente e sem
  duplicar/alterar dados existentes. A lista vive em `prisma/catalogo.cjs`
  (fonte única, usada também pelo seed completo).
- **Dados de exemplo (opcional):** funcionários/computadores de exemplo **não**
  são inseridos automaticamente. Para popular localmente: `npm run db:seed`.
  Para garantir só o catálogo localmente: `npm run db:catalogo`.
- **Imagem:** ~550 MB (base Alpine + engine do Prisma). Bem menor que uma imagem
  com `node_modules` completo graças ao `output: "standalone"`.

Arquivos relevantes: [`Dockerfile`](./Dockerfile),
[`docker-compose.yml`](./docker-compose.yml),
[`docker-entrypoint.sh`](./docker-entrypoint.sh), [`.dockerignore`](./.dockerignore).

---

## Scripts

| Comando               | O que faz                                       |
| --------------------- | ----------------------------------------------- |
| `npm run dev`         | Servidor de desenvolvimento                     |
| `npm run build`       | Build de produção (checa tipos)                 |
| `npm start`           | Sobe o build de produção                        |
| `npm run lint`        | Lint (ESLint / next lint)                       |
| `npm test`            | Testes de unidade (vitest)                      |
| `npm run db:migrate`  | `prisma migrate dev`                            |
| `npm run db:studio`   | Prisma Studio (inspeção visual do banco)        |
| `npm run db:seed`     | Popula dados iniciais (catálogo + exemplos)     |
| `npm run db:catalogo` | Garante só o catálogo de tipos (idempotente)    |
| `npm run db:wal`      | Ativa o modo WAL do SQLite (idempotente)        |
| `npm run db:backup`   | Backup consistente do banco (`VACUUM INTO`)     |

---

## Variáveis de ambiente

| Variável           | Exemplo         | Descrição                                        |
| ------------------ | --------------- | ------------------------------------------------ |
| `DATABASE_URL`     | `file:./dev.db` | Caminho do banco SQLite (Prisma)                 |
| `BASIC_AUTH_USER`  | `ti`            | (Opcional) liga a auth Basic — usuário           |
| `BASIC_AUTH_PASS`  | `••••••`        | (Opcional) liga a auth Basic — senha             |

A auth Basic fica **desligada** enquanto as duas variáveis não forem definidas
(ver [`.env.example`](./.env.example) e `middleware.ts`).

> `.env` e `prisma/dev.db` **não** entram no git (ver `.gitignore`).

---

## Convenções de código

- TypeScript com tipos explícitos nas funções de API.
- Componentes de UI pequenos e reutilizáveis.
- Toda escrita no banco validada com zod na camada de API.
- Comentários em português, diretos.
- Sem dependências desnecessárias — projeto enxuto.

---

## Qualidade e CI

- **Testes:** `npm test` (vitest) cobre as funções puras — validações zod e a
  (de)serialização das especificações. Ficam ao lado do código (`lib/*.test.ts`).
- **Lint:** `npm run lint` (ESLint `next/core-web-vitals`).
- **Robustez do front:** o carregamento das telas checa `res.ok` e mostra erro
  com "Tentar novamente" em vez de quebrar (helper em `lib/fetcher.ts`).
- **CI:** `.github/workflows/ci.yml` roda lint + testes + build em cada push/PR
  para `main` e `develop`.

---

## Decisões técnicas

Registradas em [`docs/decisoes.md`](./docs/decisoes.md). Resumo:

1. SQLite como fonte única de verdade (Excel é só relatório).
2. Catálogo de tipos em tabela, não enum.
3. `especificacoes` como JSON livre por componente.
4. `cargo` como texto livre.
5. Regra de remoção/inativação de funcionário com computador.
6. Dashboard do Excel com data bars (limitação do exceljs com charts).
7. shadcn/ui escrito à mão.
8. Login/licenças/conta como campos do `Computador` (não tabela à parte).
9. Postura de segurança/acesso e política de dependências (Next.js).
10. Periféricos como booleans de presença (mouse/teclado/headset).
11. SQLite em modo WAL + índices de chave estrangeira.
12. Concorrência otimista na edição de computador (`esperaAtualizadoEm`).

---

## Segurança e acesso

Ferramenta **interna**, **sem autenticação**, para rodar em **rede restrita** do
escritório. O banco `prisma/dev.db` guarda chaves de licença e contas de e-mail
em texto:

- Trate o `dev.db` como arquivo sensível: **restrinja acesso ao servidor e aos
  backups** (os backups também contêm os dados).
- **Não** armazene senhas no sistema.
- Sem login, qualquer um com acesso de rede pode editar dados — adequado para
  LAN confiável. Se for exposto além do escritório, **adicionar autenticação
  antes**.

Endurecimento já disponível (sem mudar o padrão de LAN sem login):

- **Headers de segurança** em todas as respostas (X-Frame-Options, nosniff,
  Referrer-Policy, Permissions-Policy) — `next.config.mjs`.
- **Auth Basic opcional** (`middleware.ts`): ligue definindo `BASIC_AUTH_USER` e
  `BASIC_AUTH_PASS`. Cobre todas as rotas, inclusive `/api/export`.
- **Limites de tamanho** nas entradas (zod) para evitar payloads abusivos.
- **Backup** com `npm run db:backup` (consistente mesmo com o app no ar).

Sobre dependências: o Next está fixado em **14.2.35** (última correção da linha
14.2.x). Os avisos restantes do `npm audit` só se resolvem migrando para o
Next 16 (mudança quebradora) e são vetores relevantes a apps **expostos
publicamente**; para uso interno em LAN optou-se por não migrar agora.

---

## Branches

- **`main`** — branch estável/produção. Reflete o que está pronto e revisado.
- **`develop`** — branch de integração para o trabalho em andamento.

Fluxo sugerido: criar branches de feature a partir de `develop`
(`feat/...`, `fix/...`), abrir PR para `develop` e, quando estável, promover
`develop` → `main`.

---

## Roadmap / melhorias futuras

Itens mapeados e ainda não implementados (opcionais):

- Visão do funcionário → lista dos seus computadores.
- Testes automatizados (validação/API).
- Sistema de toast/confirmação no lugar de `alert`/`confirm` nativos.
- Autenticação (caso o app saia da LAN).

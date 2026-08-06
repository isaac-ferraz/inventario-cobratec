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

**Qualidade/processo:** **testes** com vitest (`lib/*.test.ts`, funções puras);
**ESLint** configurado; **CI** no GitHub Actions (lint + testes + build em
push/PR para `main` e `develop`).

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

**Autenticação e papéis (decisão 19):** o sistema **exige login**. Model
`Usuario` (login único, `senhaHash` scrypt, papel `ADMIN`|`OPERADOR`, `ativo`,
`senhaProvisoria`, vínculo opcional com `Funcionario`) + CRUD em `/usuarios` (só
admin). **Administrador** faz tudo; **operador** só alcança `/chamados` e
`/trocar-senha`. Sessão em cookie httpOnly assinado por HMAC (`lib/sessao.ts`,
Web Crypto — funciona no Edge do middleware), com **reconferência no banco** em
`lib/sessao-servidor.ts` (papel e `ativo` valem os do banco, não os do cookie).
Autorização em duas camadas: `middleware.ts` (portão de navegação) **e**
`exigirSessao`/`exigirAdmin` (`lib/autorizacao.ts`) no início de cada rota de
API — nenhuma rota confia só no middleware. `AUTH_SECRET` é **obrigatório** (o
app e o entrypoint recusam subir sem ele). Admin inicial idempotente em
`prisma/seed-admin.cjs`; senha definida por terceiro nasce provisória e a troca
é cobrada no primeiro acesso. Travas: não dá para rebaixar/inativar/remover o
último admin ativo, nem remover a própria conta.

**Repositório:** GitHub privado `isaac-ferraz/inventario-cobratec`. Branches:
`main` (estável), `develop` (integração), `feat/docker` (Docker + catálogo).

**Observação sobre as skills citadas acima:** `xlsx` e
`consultor-mini-app-sqlite` não estavam instaladas no ambiente; o projeto foi
construído sem elas.

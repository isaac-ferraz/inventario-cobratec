# Inventário Cobratec — Resumo do Projeto

## O que é
Aplicação web **interna** do TI da Cobratec para controlar o hardware dos
computadores do escritório: cadastro de máquinas, componentes, funcionários
(donos), licenças/contas, dashboard de indicadores e exportação de relatório
Excel. Uso restrito ao TI, em rede local. **SQLite é a fonte única de verdade**;
o Excel é só relatório de saída.

## Stack
- **Next.js 14** (App Router) — frontend + API no mesmo projeto
- **TypeScript**
- **Prisma** + **SQLite** (`prisma/dev.db`)
- **shadcn/ui** (escrito à mão) + **Tailwind CSS**
- **zod** (validação na API), **exceljs** (Excel), **lucide-react** (ícones)

## Modelo de dados (Prisma)
- **Funcionario**: nome, cargo (texto livre), ativo, **loginSiscobra?/
  senhaSiscobra?/loginVonix?/senhaVonix?** (credenciais dos sistemas, substituem a
  antiga matrícula), computadores[]
- **Computador**: identificador (único), apelido?, **observacoes?**, loginPadrao?,
  **senha?**, licencaWindows?, licencaMicrosoft?, contaOutlook?, **temMouse/
  temTeclado/temHeadset** (booleans de presença), funcionarioId? (null = estoque),
  componentes[]
- **TipoComponente**: nome (único) — catálogo editável
- **Componente**: descricao, especificacoes? (JSON livre guardado como texto, pois
  o SQLite não suporta Json no Prisma), tipo, computador (cascade)

## Funcionalidades
- **Computadores**: listar com **busca** (identificador/apelido/login/conta/dono)
  e filtros (funcionário, cargo); criar, editar, remover (cascade), **mover**
  entre funcionários; campo de **Observações** livre; login padrão, licença
  Windows, licença Microsoft e conta Outlook por máquina; **periféricos**
  (mouse/teclado/headset — só presença) por máquina.
- **Componentes**: adicionar/editar/remover por PC, com tipo do catálogo e
  especificações livres (chave/valor).
- **Funcionários**: CRUD, **inativar** (preserva histórico), regra de liberação
  de máquinas ao remover; inativos não aparecem no seletor de dono.
- **Tipos de componente**: catálogo editável (não remove tipo em uso).
- **Dashboard**: KPIs, por cargo, por tipo, e **pendências de licença/conta**
  (inclui "sem headset").
- **Excel**: `.xlsx` com aba Inventário + aba Dashboard (com data bars).

## Histórico do que foi construído
1. **Build inicial completo** do app a partir do `CLAUDE.md` (toda a stack, com
   seed e dados de exemplo).
2. **Campos por computador**: login padrão (COB-número), licença Windows, licença
   Microsoft/Office, conta Outlook.
3. **Melhorias**: limpar matrícula na edição; inativos fora do seletor de dono;
   validação de e-mail no servidor; **busca** na lista de computadores;
   **pendências de licença/conta** no Dashboard e no Excel; **upgrade do Next.js
   14.2.21 → 14.2.35** (correção de segurança); **README** completo; reforço de
   segurança no `docs/decisoes.md`.
4. **GitHub**: repositório **privado** `inventario-cobratec` (conta
   `isaac-ferraz`), branches **`main`** e **`develop`**.
5. **Docker**: imagem enxuta (Next `output: standalone` + multi-stage Alpine +
   usuário não-root), `docker-compose` com **volume** persistente, migrations no
   boot. Branch **`feat/docker`**.
6. **Catálogo sempre presente**: script idempotente (`prisma/seed-catalogo.cjs`,
   lista única em `prisma/catalogo.cjs`) roda em todo boot do container — não
   precisa rodar o seed manualmente.
7. **Periféricos por computador**: booleans `temMouse`/`temTeclado`/`temHeadset`
   (só presença) — toggles no formulário, badges na lista, colunas no Excel e
   pendência "sem headset" no Dashboard. Branch **`feat/perifericos`**.
8. **Robustez, segurança e processo** (branch **`feat/robustez-e-melhorias`**):
   índices de FK + modo WAL do SQLite; helper de fetch que checa `res.ok` (fim do
   "tela branca" em erro de API) + UX/a11y das ações; limites de tamanho na API,
   delete de funcionário transacional e filtro coerente; concorrência otimista na
   edição de computador; headers de segurança + auth Basic opcional; ESLint
   configurado; testes (vitest); CI no GitHub Actions; healthcheck no Docker e
   script de backup (`VACUUM INTO`). Decisões 11 e 12 em `decisoes.md`.
   Também refatorou a tela de Computadores (page de 911 → 225 linhas) em
   componentes (`components/computadores/`: tipos, filtros, card e os dois
   diálogos com estado próprio), sem mudança de comportamento.
9. **Trilha de auditoria** (branch **`feat/auditoria`**): model `LogAuditoria`
   append-only registra criar/editar/remover/mover das quatro entidades, com
   ator (quando a auth Basic está ligada, via `x-usuario` no middleware), API
   `GET /api/auditoria` e tela `/auditoria` com filtro. Registro best-effort
   (fora da transação). Decisão 13 em `decisoes.md`. O "mover" registra
   origem → destino (de quem era / para quem foi).
10. **Redesign** (branch **`feat/redesign`**): sistema de design "etiqueta de
    patrimônio / painel técnico" — paleta lab + acento teal, tipografia Space
    Grotesk + IBM Plex Sans + IBM Plex Mono (self-hosted), nav lateral, cards de
    PC como etiqueta de ativo e Dashboard como leituras de instrumento.
    Decisão 14 em `decisoes.md`.

## Repositório
- **URL**: https://github.com/isaac-ferraz/inventario-cobratec (privado)
- **Branches**: `main` (estável), `develop` (integração), `feat/docker` (Docker +
  catálogo automático)

## Como rodar
**Local:**
```bash
npm install
npx prisma migrate dev
npm run db:seed        # opcional: catálogo + dados de exemplo
npm run dev            # http://localhost:3000
```
**Docker:**
```bash
docker compose up -d --build
# acesso: http://localhost:3000  (ou http://<IP-da-máquina>:3000 na LAN)
```
Scripts úteis: `db:migrate`, `db:studio`, `db:seed`, `db:catalogo`.

## Decisões técnicas
Registradas em [`docs/decisoes.md`](./decisoes.md): SQLite como fonte de verdade;
catálogo em tabela (não enum); `especificacoes` como JSON em texto; cargo texto
livre; regra de remoção/inativação de funcionário; Excel com data bars (exceljs
não cria gráficos nativos na escrita); shadcn/ui à mão; login/licenças/conta como
campos do Computador; postura de segurança e política de dependências (ficar no
Next 14.2.x para uso interno em LAN).

## Segurança
Ferramenta interna **sem autenticação**, para LAN restrita. `dev.db` guarda
licenças/contas em texto → restringir acesso ao servidor e backups; **não**
armazenar senhas. Se for exposta fora do escritório, adicionar autenticação antes.

## Roadmap (opcionais não feitos)
Visão funcionário→computadores; testes automatizados; toast/confirm no lugar de
`alert`/`confirm` nativos; autenticação (se sair da LAN).

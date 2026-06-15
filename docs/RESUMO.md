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
- **Funcionario**: nome, cargo (texto livre), matrícula?, ativo, computadores[]
- **Computador**: identificador (único), apelido?, **observacoes?**, loginPadrao?,
  licencaWindows?, licencaMicrosoft?, contaOutlook?, funcionarioId? (null =
  estoque), componentes[]
- **TipoComponente**: nome (único) — catálogo editável
- **Componente**: descricao, especificacoes? (JSON livre guardado como texto, pois
  o SQLite não suporta Json no Prisma), tipo, computador (cascade)

## Funcionalidades
- **Computadores**: listar com **busca** (identificador/apelido/login/conta/dono)
  e filtros (funcionário, cargo); criar, editar, remover (cascade), **mover**
  entre funcionários; campo de **Observações** livre; login padrão, licença
  Windows, licença Microsoft e conta Outlook por máquina.
- **Componentes**: adicionar/editar/remover por PC, com tipo do catálogo e
  especificações livres (chave/valor).
- **Funcionários**: CRUD, **inativar** (preserva histórico), regra de liberação
  de máquinas ao remover; inativos não aparecem no seletor de dono.
- **Tipos de componente**: catálogo editável (não remove tipo em uso).
- **Dashboard**: KPIs, por cargo, por tipo, e **pendências de licença/conta**.
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

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
- **Sala**: nome (único), predio?, piso?, ordem, ativa, observacoes? — catálogo
  editável da divisão física do escritório
- **Usuario**: login (único), nome, senhaHash (scrypt), papel (ADMIN|OPERADOR),
  ativo, senhaProvisoria, funcionarioId? — quem ENTRA no sistema
- **Manutencao**: tipo (corretiva|preventiva), descricao, fornecedor?, custo?,
  abertaEm, concluidaEm? (null = no conserto), computador?/celular?, chamado?
- **Chamado**: numero (sequencial), titulo, descricao, categoria?, prioridade,
  status, solicitante, responsavel?, computador?/celular?/sala? (contexto)
- **ChamadoMensagem**: corpo, `interna` (nota do TI), autor, chamado (cascade)
- **Funcionario**: nome, cargo (texto livre), ativo, **loginSiscobra?/
  senhaSiscobra?/loginVonix?/senhaVonix?** (credenciais dos sistemas, substituem a
  antiga matrícula), **salaId?** (onde senta), computadores[]
- **Computador**: identificador (único), apelido?, **observacoes?**, loginPadrao?,
  **senha?**, licencaWindows?, licencaMicrosoft?, contaOutlook?, **temMouse/
  temTeclado/temHeadset** (booleans de presença), funcionarioId? (null = estoque),
  **salaId?** (onde a máquina está), componentes[]
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
- **Salas**: catálogo editável da divisão física (93 superior/inferior,
  Administrativo 83, Judiciário 83 e quantas mais o TI quiser); filtro por sala
  em computadores e funcionários; sala em uso não é removível (desative).
  Cada sala tem **página própria** (`/salas/[id]`) com os postos de trabalho
  (pessoa + computadores + celulares) e as máquinas sem posto, com movimentação
  entre salas item a item ou em lote.
- **Tipos de componente**: catálogo editável (não remove tipo em uso).
- **Ciclo de vida**: situação do equipamento (ativo/manutenção/reserva/
  descartado), aquisição, nota fiscal, garantia e valor; **manutenções** com
  tipo, fornecedor, custo e vínculo ao chamado que originou. Abrir/concluir
  manutenção move a situação sozinha.
- **Chamados**: operador abre e acompanha; TI assume, prioriza, responde
  (inclusive com **nota interna**, invisível ao solicitante) e resolve; o
  solicitante confirma o fechamento ou reabre. Chamado leva sala e equipamento
  do próprio usuário como contexto.
- **Usuários e acesso**: login obrigatório; **administrador** faz tudo,
  **operador** só abre/acompanha chamados. CRUD em `/usuarios` (só admin),
  troca da própria senha, senha provisória cobrada no primeiro acesso.
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
11. **Celulares e depósito** (branch **`feat/celulares-e-deposito`**): entidade
    `Celular` espelhando o computador e o `ItemDeposito` (estoque de suprimentos
    por quantidade). Decisões 15 e 17 em `decisoes.md`.
12. **Salas** (branch **`feat/salas`**): catálogo editável `Sala` com CRUD em
    `/salas`, `salaId` no computador (onde a máquina está) e no funcionário (onde
    a pessoa senta), filtros por sala, badge no card, sugestão da sala do dono ao
    vincular, seed idempotente das 4 salas no boot e reflexo no Excel/Dashboard.
    Em seguida ganhou **página por sala** (`/salas/[id]`) com postos de trabalho
    e movimentação em lote (`POST /api/salas/mover`). Decisões 18 e 18.1 em
    `decisoes.md`.
13. **Autenticação com papéis** (branch **`feat/auth-usuarios`**): model
    `Usuario`, login/logout, sessão assinada, troca de senha, CRUD de usuários,
    menu filtrado por papel, guardas em todas as rotas de API e travas
    anti-tranca de administrador. Remove a Basic Auth. Decisão 19 em
    `decisoes.md`.
14. **Chamados** (branch **`feat/chamados`**): helpdesk completo — abrir,
    atender, conversar (com nota interna do TI), resolver e fechar. Regras em
    funções puras testadas (`lib/chamados.ts`), escopo por papel na API,
    contexto de sala/equipamento e KPIs de suporte no Dashboard. Decisão 20 em
    `decisoes.md`.
15. **Ciclo de vida do ativo** (branch **`feat/ciclo-vida`**): situação,
    aquisição, nota fiscal, garantia e valor nos equipamentos; model
    `Manutencao` com tela própria; coerência estado↔evento em transação; aviso
    de garantia acabando; KPIs no Dashboard e aba "Manutenções" no Excel.
    Decisão 21 em `decisoes.md`.

## Repositório
- **URL**: https://github.com/isaac-ferraz/inventario-cobratec (privado)
- **Branches**: `main` (estável) e `develop` (integração) caminham juntas com a
  última feature entregue. Histórico linear: `feat/salas` → `feat/auth-usuarios`
  → `feat/chamados` → `feat/ciclo-vida`, cada uma partindo da anterior.

## Como rodar
**Local:**
```bash
npm install
cp .env.example .env   # defina AUTH_SECRET (obrigatório)
npx prisma migrate dev
npm run db:seed        # opcional: catálogo + dados de exemplo
npm run db:admin       # cria o administrador inicial
npm run dev            # http://localhost:3000
```
**Docker:**
```bash
docker compose up -d --build
# acesso: http://localhost:3000  (ou http://<IP-da-máquina>:3000 na LAN)
```
Scripts úteis: `db:migrate`, `db:studio`, `db:seed`, `db:catalogo`, `db:salas`,
`db:admin`.

## Decisões técnicas
Registradas em [`docs/decisoes.md`](./decisoes.md): SQLite como fonte de verdade;
catálogo em tabela (não enum); `especificacoes` como JSON em texto; cargo texto
livre; regra de remoção/inativação de funcionário; Excel com data bars (exceljs
não cria gráficos nativos na escrita); shadcn/ui à mão; login/licenças/conta como
campos do Computador; postura de segurança e política de dependências (ficar no
Next 14.2.x para uso interno em LAN).

## Segurança
**Login obrigatório com papéis** (decisões 19, 24 e 27): administrador faz tudo;
supervisor de sala manda no recorte dele; **cobrança** alcança as conversas com
devedor (`/chat`) e nada do inventário; operador só abre/acompanha chamados.
Senha de login em hash scrypt; sessão em cookie
httpOnly assinado, revogável (papel e `ativo` reconferidos no banco a cada
requisição). `AUTH_SECRET` é obrigatório para o app subir.

O `dev.db` continua guardando o **cofre** de credenciais (Siscobra/Vonix, senha
do PC, licenças) em texto — é o propósito dele, e agora está atrás de login.
Ainda assim: restringir acesso ao servidor e proteger os **backups**.

## Roadmap
O plano de 5 fases está **concluído**: **1. Salas** (`feat/salas`),
**2. Login com papéis** (`feat/auth-usuarios`), **3. Chamados**
(`feat/chamados`), **4. Ciclo de vida do ativo** (`feat/ciclo-vida`) e
**5. Polimento** (`feat/polimento`) — toast/confirm próprios, testes de
API/autorização, paginação, tema claro/escuro e backup agendado.

Na mesma branch `feat/polimento` entrou a **interatividade**: filtros na URL,
drill-down do Dashboard (todo número leva à lista por trás dele), perfil do
funcionário em `/funcionarios/[id]` e a logo oficial da Cobratec no topo.
Decisões 22 e 23 em [`decisoes.md`](./decisoes.md).

16. **Supervisor de sala** (branch **`feat/polimento`**): papel `SUPERVISOR`
    ligado a quantas salas precisar, com alcance definido por funções puras em
    `lib/supervisao.ts` e filtros aplicados no `where` do Prisma. Vê e edita o
    que está nas salas dele — inclusive o cofre de senhas da equipe — e não
    alcança nada fora delas nem as telas globais do TI. Decisão 24 em
    `decisoes.md`.

17. **Caça a bugs** (decisão 25 em [`decisoes.md`](./decisoes.md)): varredura no
    navegador e na API corrigiu oito defeitos, entre eles o **papel do supervisor
    morrendo no login** (cookie assinado como operador ⇒ decisão 24 inalcançável),
    data inexistente sendo gravada calada e o admin conseguindo se trancar fora do
    sistema. Entraram freio de força bruta no login, CSP e mensagens de erro em
    pt-BR. Testes: 177 → **244**.

18. **Importação de CSV** (decisão 26): botão "Importar CSV" nas sete telas de
    cadastro, com prévia linha por linha antes de gravar, relação por nome,
    modelo para baixar e parser próprio para o CSV do Excel brasileiro. A
    validação reaproveita os schemas da tela — nada de regra duplicada. Testes:
    244 → **323**.

19. **Papel de cobrança** (decisão 27): quarto papel, `COBRANCA`, para a
    operadora que atende devedor por WhatsApp. Tem destino próprio (`/chat`,
    destacado na navegação) e **não enxerga inventário nenhum**; o supervisor de
    sala, por sua vez, não alcança as conversas — dado pessoal de devedor se
    decide pelo ofício, não pela sala. O campo `siscobraUsucod` (código da
    operadora no CRM) anda colado ao papel nos três caminhos de escrita. A tela
    de conversas está em **fase 0**: portão e lugar prontos, serviço de WhatsApp
    e dossiê do Siscobra ainda por ligar. Testes: 323 → **357**.

20. **Chatbot de cobrança** (decisão 28): o `/chat` deixou de ser moldura. Um
    robô de WhatsApp atende o devedor, consulta o **Siscobra** e passa para a
    operadora quando precisa — com fila, conversa e **dossiê** lado a lado.
    Fronteiras rígidas: o **n8n é o chatbot** (classifica, consulta, redige),
    o **WAHA** é o canal, e o inventário **não fala com o Siscobra nem com o
    WhatsApp** — recebe o dossiê empurrado como snapshot. A trava do domínio
    (nenhum valor antes de CPF + nascimento; nenhuma proposta fora da regra da
    carteira) é **código**, não prompt. Passo a passo em
    [`docs/conversas/`](./conversas/README.md). Testes: 357 → **431**.
21. **Modo direto do WhatsApp** (decisão 29): dá para **conectar um número e
    conversar agora**, sem n8n, sem Twilio e sem API oficial da Meta — o
    caminho de teste. Liga com `WAHA_URL` no `.env`; o pareamento é um QR na
    tela **/chat → Conexão** (só admin). Sem robô do outro lado, tudo que chega
    cai na **fila** da operadora. O desenho da decisão 28 fica intacto: o n8n
    tem precedência, e o inventário continua sem conexão com o Siscobra. As
    duas portas de webhook dividem a mesma máquina de estados
    (`lib/chat-registro.ts`) e o mesmo segredo. Testes: 431 → **463**.
22. **Anexo e fila ao vivo** (decisão 30): o primeiro teste com um número real
    mostrou o defeito de fundo — o filtro **descartava em silêncio**, e agora
    todo evento ignorado registra o motivo (sem conteúdo nem número). **Mídia
    entra**: áudio, foto e PDF viram mensagem com marcador e o arquivo baixa
    depois, fora do banco, servido pelo portão da conversa. Remetente em `@lid`
    (o endereçamento novo do WhatsApp) tem o telefone procurado nos campos
    vizinhos. E a **fila é ao vivo** por SSE, com a consulta periódica virando
    rede de segurança. Fluxos do n8n prontos para importar em
    [`conversas/n8n/`](./conversas/n8n/). Testes: 463 → **490**.
23. **Robô local de triagem** (decisão 31): um modelo rodando **na própria
    máquina** (Ollama) recebe o devedor e passa para gente assim que o assunto
    encosta em dívida. Local porque conversa de devedor não sai da empresa — sem
    chave, sem nuvem, sem contrato de tratamento de dado por causa de um "olá".
    O desenho veio de medir: com um modelo pequeno, "já paguei" recebeu **"Não,
    ainda não"** e "vou chamar meu advogado" fez o modelo **inventar um
    telefone**. Então a ordem se inverteu — **o código decide o que é perigoso**
    (`assuntoExigeGente`) e o modelo só é consultado no que sobra; depois,
    `avaliarResposta` confere o texto pronto antes de ele sair. Toda saída que
    não é "respondeu" termina em **escalar, nunca em silêncio**. Liga com
    `OLLAMA_URL`; vazio mantém tudo caindo na fila. Testes: 490 → **534**.
24. **Modelo no Colab** (decisão 31.1): quando a máquina do escritório não
    aguenta o modelo, o notebook
    [`conversas/colab/`](./conversas/colab/ollama-colab.ipynb) sobe o Ollama numa
    GPU do Colab, **mede** as falas típicas contra o teto de 45s e imprime as
    linhas do `.env`. É **caminho de teste**: modelo fora da rede quer dizer que
    a fala do devedor sai da empresa. O desenho não impede, mas não deixa
    invisível — a tela **Conexão** avisa em vermelho quando é o caso. O túnel
    não expõe o Ollama direto (que não tem autenticação): um proxy exige
    `OLLAMA_TOKEN` e libera só duas rotas. Testes: 534 → **552**.

### O que sobrou para depois
- **Deploy**: `docs/deploy.md` está escrito (Oracle Always Free + Docker), mas o
  sistema ainda roda só em LAN — falta escolher e provisionar o host.
- **Agendar o backup de verdade**: o mecanismo e o passo a passo estão prontos
  em [`backup.md`](./backup.md); o cron/systemd depende de onde o app for morar.
- **Confirmação visual em 390px**: a estrutura mobile foi auditada e não tem
  impedimento (layout empilha em `md:`, tabelas rolam no próprio container), mas
  falta olhar numa tela de celular de verdade — fonte, diálogos e alvo de toque
  (13 dos 39 alvos ficam abaixo de 36px). Ver o fim da decisão 25.
- **O chatbot que negocia**: o número conecta, a conversa acontece e o robô
  local já **tria** (decisão 31) — mas quem fala de dívida é gente, porque ele
  não tem dado nenhum. Falta montar os dois fluxos do n8n, a credencial de
  leitura do Siscobra e os prompts — tudo escrito em
  [`docs/conversas/`](./conversas/README.md), nada disso muda o desenho do papel
  `COBRANCA` (decisão 27) nem a fronteira da decisão 28.
- **Medir o robô com gente de verdade**: as travas foram calibradas contra
  `llama3.2:1b` numa máquina apertada. Vale reler os motivos de escalonamento
  depois de uns dias no ar — se quase tudo estiver caindo na fila, o modelo é
  pequeno demais para o pouco que sobrou para ele. A comparação 1B × 3B já está
  pronta para rodar no notebook do Colab (decisão 31.1).
- **Onde o modelo vai morar de verdade**: o Colab resolve o teste, não a
  produção (sessão que cai, endereço que muda, e a fala do devedor saindo da
  empresa). Se o 3B provar valer a pena, a decisão seguinte é uma máquina com
  GPU dentro da rede — ou aceitar o 1B local, que já atende o pouco que sobrou
  para o robô.

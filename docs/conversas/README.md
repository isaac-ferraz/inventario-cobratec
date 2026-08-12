# Conversas com devedor — como ligar o chatbot

O que este documento cobre: subir o gateway, montar os dois fluxos no n8n e
apontar tudo para o inventário. A decisão de arquitetura e o **porquê** de cada
escolha estão na decisão 28 (`docs/decisoes.md`); aqui é o passo a passo.

> **Só quer ver o WhatsApp funcionando?** Pule para
> [Modo direto — WhatsApp sem n8n](#modo-direto--whatsapp-sem-n8n), no fim. São
> dois comandos e um QR code; o chatbot fica para depois.

## O desenho em uma imagem

```
  Devedor (WhatsApp)
        │
        ▼
  WAHA  (Docker, LAN, :3001)          ← gateway open source, motor NOWEB
        │  webhook
        ▼
  n8n  (já em uso na casa)            ← O CHATBOT MORA AQUI
        ├── classifica a intenção      (LLM, temperature 0, saída JSON)
        ├── consulta o Siscobra        (PostgreSQL, SOMENTE LEITURA)
        ├── redige a resposta          (LLM, só com dado confirmado)
        └── decide: responder ou escalar
        │
        ├──────────► WAHA (envia ao devedor)
        │
        ▼  POST /api/chat/webhook  (Bearer CHAT_SERVICE_TOKEN)
  Inventário (este app)
        └── /chat: fila + conversa + dossiê para a operadora
                    │
                    └── ao responder: POST no CHAT_ENVIO_URL do n8n
```

**O inventário nunca fala com o Siscobra nem com o WhatsApp.** Ele é o registro
do atendimento e a tela da operadora. Trocar WAHA por outro gateway é mexer só
no n8n.

---

## Passo 1 — subir o gateway

```bash
# no .env, ao lado do docker-compose.waha.yml
WAHA_API_KEY="$(openssl rand -base64 32)"
WAHA_HOOK_URL="http://SEU-N8N:5678/webhook/cobratec-receber"

docker compose -f docker-compose.waha.yml up -d
```

Pareie o número abrindo `http://127.0.0.1:3001` e lendo o QR code.

> **Use um chip dedicado.** Gateway não-oficial contraria os termos do WhatsApp
> e o número pode ser banido — em cobrança, perder a linha principal do
> escritório é prejuízo operacional.

## Passo 2 — segredo compartilhado

```bash
# no .env do inventário
CHAT_SERVICE_TOKEN="$(openssl rand -base64 32)"
CHAT_ENVIO_URL="http://SEU-N8N:5678/webhook/cobratec-enviar"
```

O mesmo `CHAT_SERVICE_TOKEN` vai nos dois fluxos do n8n. Ele vale nos dois
sentidos: o n8n o usa para entregar mensagem, o inventário o usa para pedir
envio.

## Passo 3 — credencial do Siscobra no n8n

Credencial Postgres apontando para `192.168.0.253:5432`, com um usuário que
tenha **apenas `GRANT SELECT`**. As consultas prontas estão em
[`siscobra.sql`](./siscobra.sql) — não escreva outras sem ler os avisos de lá:
há colunas com nome convincente e valor zerado que fariam o robô dizer "você
deve R$ 0,00".

> **Atalho:** os dois fluxos estão prontos para importar em
> [`n8n/`](./n8n/) — `Workflows → Import from File`. Eles trazem a parte
> chata já feita (leitura do payload do WAHA, cabeçalhos de autenticação, a
> ordem dos nós, o IF que faz o robô calar) e deixam **o LLM como nó vazio**,
> para você plugar o modelo que usa. Configure em `Settings → Variables`:
> `COBRATEC_URL`, `CHAT_SERVICE_TOKEN`, `WAHA_URL` e `WAHA_API_KEY`.
> Foram conferidos na estrutura, mas **não** contra o seu n8n — importe e rode
> o fluxo uma vez antes de confiar.

## Passo 4 — fluxo 1: RECEBER (`/webhook/cobratec-receber`)

| # | Nó | O que faz |
|---|---|---|
| 1 | **Webhook** POST `cobratec-receber` | recebe do WAHA |
| 2 | **Code** | extrai `telefone` (do JID `5512…@c.us`), `corpo`, `waId`, `pushName`; descarta mensagem de grupo e a própria (`fromMe`) |
| 3 | **HTTP Request** → inventário | `POST /api/chat/webhook` com `autor: "devedor"`. **Antes de pensar**: se a gravação falhar, ninguém perde a fala do cliente |
| 4 | **IF** `situacao == "humana"` | **para aqui.** Uma operadora assumiu; o robô cala |
| 5 | **LLM** classificador | prompt 1 de [`prompts.md`](./prompts.md), `temperature: 0`, saída JSON |
| 6 | **IF** `escalar` | → nó 10 |
| 7 | **Postgres** | identificação (consulta 2) quando vieram CPF e nascimento; senão, palpite por telefone (consulta 1) |
| 8 | **Postgres** | dossiê (consulta 3) + regra da carteira (consulta 4) — **só** se identificou |
| 9 | **LLM** redator | prompt 2. Injeta o bloco de dossiê **apenas** se identificado |
| 10 | **HTTP Request** → inventário | `POST /api/chat/webhook` com `autor: "bot"`, mais `identificado`, `siscobraDevcod`, `carteira`, `dossie`, `escalar`, `motivoEscalonamento` |
| 11 | **HTTP Request** → WAHA | `POST /api/sendText` entrega a resposta (pular quando escalou sem resposta) |

Ordem dos nós 3 e 10: a fala do devedor é gravada **antes** de qualquer
processamento. Se o LLM cair, a conversa aparece na fila do mesmo jeito — o
devedor não fica invisível por causa de um modelo fora do ar.

## Passo 5 — fluxo 2: ENVIAR (`/webhook/cobratec-enviar`)

O inventário chama quando a operadora responde.

| # | Nó | O que faz |
|---|---|---|
| 1 | **Webhook** POST `cobratec-enviar` | recebe `{ telefone, corpo }`; confere o header `Authorization: Bearer <CHAT_SERVICE_TOKEN>` |
| 2 | **HTTP Request** → WAHA | `POST /api/sendText` |
| 3 | **Respond to Webhook** | devolve `{ "waId": "<id>" }`, **e só depois do envio confirmado** |

O passo 3 é o que sustenta a garantia da tela: o inventário só grava a mensagem
na thread quando este fluxo responde 200. Responder antes de enviar faria a
operadora ver na tela uma resposta que o devedor nunca recebeu.

## Passo 6 — conferir

```bash
# 1. o inventário aceita o token?
curl -s -X POST http://localhost:3000/api/chat/webhook \
  -H "Authorization: Bearer $CHAT_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"telefone":"5512997654321","autor":"devedor","corpo":"teste"}'
# → {"ok":true,"conversaId":"...","situacao":"bot"}
```

Depois: entre no `/chat` com um usuário de papel **Cobrança**, veja a conversa
na fila, clique em **Assumir** e responda. Se o n8n estiver fora do ar, a tela
diz que a mensagem **não** foi enviada, em vez de fingir que foi.

## Cadastro da operadora

`/usuarios` → papel **Cobrança** → preencher **Código no Siscobra**
(`usuario.usucod`). Sem ele não há como atribuir a conversa a quem trabalhou o
caso nem medir conversão — as regras de atribuição do Siscobra são todas por
`usucod`.

---

## Modo direto — WhatsApp sem n8n

O caminho de **teste** (decisão 29): o inventário fala com o gateway sem chatbot
no meio. Serve para parear um número e ver a conversa acontecer ponta a ponta
antes de existir fluxo de n8n. Sem Twilio e sem API oficial da Meta.

```
WhatsApp → WAHA → inventário (/chat)
                      └─ opcional: robô local de triagem (Ollama, passo 4)
```

### Passo 1 — as variáveis

```bash
# no .env, na máquina onde o sistema roda
WAHA_API_KEY="$(openssl rand -base64 32)"       # o compose do gateway usa
CHAT_SERVICE_TOKEN="$(openssl rand -base64 32)" # autentica o webhook

# O gateway visto pelo app — e o valor MUDA conforme onde o app roda:
#   docker compose up   → http://cobratec-waha:3000   (nome do container)
#   npm run dev         → http://127.0.0.1:3001       (porta publicada)
WAHA_URL="http://cobratec-waha:3000"

# DEIXE VAZIO: com o n8n configurado, o modo direto não opera.
CHAT_ENVIO_URL=""
WAHA_HOOK_URL=""
```

**O endereço é a pegadinha desta ligação.** Com os dois em container, eles se
falam pelo **nome do container**, na mesma rede Docker — o gateway entra na rede
do inventário. O `127.0.0.1:3001` publicado no host é para **gente** (painel do
WAHA, diagnóstico); apontar o container para lá dá `connection refused`, porque
o loopback do host não aceita conexão vinda da rede do Docker.

`WAHA_WEBHOOK_URL` (o caminho de volta) segue a mesma lógica invertida e já vem
certo do `docker-compose.yml`: `http://inventario-cobratec:3000/api/chat/waha/webhook`.

Rodando em Docker, o app precisa ser recriado para reler o `.env`:
`docker compose up -d --build`.

### Passo 2 — subir o gateway e parear

```bash
docker compose up -d --build                      # o inventário primeiro
docker compose -f docker-compose.waha.yml up -d   # depois o gateway
```

A ordem importa: o gateway se pendura na rede do inventário, e não o contrário —
o sistema do TI sobe sozinho, sem saber que existe WhatsApp.

Entre no sistema como **administrador** → **/chat** → **Conexão** → botão
**Conectar**. O QR aparece na própria tela: no celular do atendimento, WhatsApp →
*Aparelhos conectados* → *Conectar um aparelho* → aponte a câmera. O selo vira
**Conectado** sozinho.

Quem configura o webhook é o próprio app, ao criar a sessão — é assim que ele
manda junto o cabeçalho de autenticação, que a variável do compose não suporta.

### Passo 3 — conferir

Mande uma mensagem de outro celular para o número pareado. Ela aparece em
**/chat** na hora — a fila é ao vivo (SSE, decisão 30) — em **Esperando
atendente**: sem robô do outro lado, tudo cai direto na fila. Clique em
**Assumir** e responda — a resposta sai pelo mesmo gateway.

Se preferir testar sem celular nenhum, simule o que o gateway entrega:

```bash
curl -s -X POST http://localhost:3000/api/chat/waha/webhook \
  -H "Authorization: Bearer $CHAT_SERVICE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"event":"message","payload":{"id":"false_5512997654321@c.us_1",
       "from":"5512997654321@c.us","fromMe":false,"body":"teste",
       "_data":{"pushName":"Ana"}}}'
# → {"ok":true,"conversaId":"...","situacao":"fila"}
```

### Passo 4 (opcional) — o robô local de triagem

Sem isto, toda mensagem espera uma pessoa, inclusive "oi". Com um modelo rodando
**na própria máquina**, o robô recebe, responde o que é inofensivo e passa para
gente assim que o assunto encosta em dívida (decisão 31). Ele **não tem dado
nenhum** — não negocia, não diz valor, não confirma pagamento.

```bash
# 1. instalar e baixar o modelo (na máquina, não em container)
curl -fsSL https://ollama.com/install.sh | sh
ollama pull llama3.2:1b

# 2. deixá-lo escutar fora do loopback, senão o container não alcança
OLLAMA_HOST=0.0.0.0 ollama serve
```

```bash
# 3. no .env do inventário
#   app em container → host.docker.internal ;  npm run dev → 127.0.0.1
OLLAMA_URL="http://host.docker.internal:11434"
OLLAMA_MODELO="llama3.2:1b"
```

`docker compose up -d --build` para reler o `.env`. Para **desligar o robô**,
apague `OLLAMA_URL`: tudo volta a cair na fila, sem remover mais nada.

Confira mandando um "oi" — a conversa fica em **Com o robô** e a resposta chega
em segundos. Depois mande "quanto eu devo?": ela vai para a fila na hora, **sem
consultar o modelo**, com o motivo escrito no card.

**Escolha do modelo, medindo:** `llama3.2:1b` responde em ~5s numa máquina
apertada; o 3B redige melhor e pede RAM livre. Meça antes de decidir —
`time ollama run llama3.2:1b "oi"` já dá a ordem de grandeza. Modelo grande
demais estoura o teto de 45s e a conversa cai na fila do mesmo jeito, só que
depois de a pessoa esperar.

**Não adianta trocar o prompt para ele falar de valor.** A trava não está no
prompt: `lib/chat-bot.ts` barra o assunto na entrada e confere o texto na saída.
Robô que fala de dívida é o da decisão 28, e esse precisa do Siscobra.

#### Se a máquina não aguentar: modelo no Colab

Quando a máquina do escritório engasga com o modelo, dá para rodá-lo numa GPU do
Google Colab e apontar o inventário para lá:
[`colab/ollama-colab.ipynb`](./colab/ollama-colab.ipynb) (abra pelo
[Colab](https://colab.research.google.com/) → *Upload*, escolha **T4 GPU** e rode
as células em ordem — ele imprime as três linhas prontas para o `.env`).

**Isto é caminho de teste, não de produção.** O modelo fora da rede significa
que a mensagem do devedor **sai da empresa**, que é justamente o que a decisão
31 recusou. Serve para medir modelo e afinar a triagem com falas inventadas; com
devedor real, o modelo mora numa máquina sua. A tela **Conexão** avisa em
vermelho enquanto o robô estiver fora da rede — se esse aviso aparecer em
produção, alguém esqueceu o `.env` apontado para o Colab.

O notebook fecha a porta que o Ollama deixa aberta: ele não expõe o Ollama
direto (que não tem autenticação nenhuma), e sim um proxy que exige
`OLLAMA_TOKEN` e libera só duas rotas. Some com a sessão do Colab: o endereço
**muda a cada execução**, a sessão cai depois de ~90 min ociosa e tem teto de
~12h. Quando cair, ou você atualiza as três variáveis, ou apaga `OLLAMA_URL` e o
atendimento volta inteiro para a fila da operadora — sem quebrar nada.

### Quando o chatbot entrar

Preencha `CHAT_ENVIO_URL` (fluxo 2 do n8n) e aponte `WAHA_HOOK_URL` para o
fluxo 1. O n8n tem precedência: o modo direto se desliga sozinho, sem remover
nada. A tela **Conexão** passa a avisar que o pareamento é assunto do n8n.

### O que muda em relação ao caminho do n8n

| | n8n (produção) | direto (teste) |
|---|---|---|
| Quem responde o devedor | o robô, e escala quando precisa | o robô local **tria**, se ligado; senão, cai na fila |
| Fala de valor e acordo | sim, com o dossiê na mão | **nunca** — barrado por código |
| Dossiê do Siscobra | chega empurrado pelo n8n | não existe |
| Pareamento do número | fluxo do n8n / painel do WAHA | tela **Conexão** |
| Mídia (áudio, foto) | depende do fluxo — a rota do n8n não trata | vira mensagem com marcador e o arquivo baixa |
| Grupo | descartado no fluxo | descartado na rota |

## O que ainda não existe

- **Transcrição de áudio**: o áudio chega, fica gravado e toca na thread — mas
  ninguém lê o que foi dito. Transcrever é trabalho do n8n (é lá que mora o
  modelo), e só faz sentido junto com o chatbot.
- **Envio de mídia pela operadora**: ela recebe foto e áudio, mas só responde
  texto. Mandar um boleto de volta é o próximo pedido óbvio.
- **Fila ao vivo em mais de uma instância**: o aviso trafega num barramento de
  processo (`lib/chat-eventos.ts`). Com duas instâncias do app, o aviso nasceria
  numa e a tela estaria na outra — a consulta periódica cobre, mas o conserto
  certo é Redis pub/sub, sem tocar na tela.
- **Registro no Siscobra**: a conversa não vira ocorrência (`retorno`) no CRM. É
  escrita, e a conexão é somente leitura — precisa de decisão do TI antes.
- **Horário de atendimento**: o robô responde a qualquer hora. Cobrança tem
  restrição legal de horário; hoje isso depende do fluxo do n8n.

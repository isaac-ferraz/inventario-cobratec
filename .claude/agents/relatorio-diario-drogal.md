---
name: relatorio-diario-drogal
description: Gera e ENVIA por e-mail o relatório diário da carteira 1163 (Rede Drogal) do Siscobra — acordos, acionamentos e honorários do dia anterior — com a planilha anexada, para a caixa de entrada do próprio usuário. Use sempre que o usuário pedir "o relatório diário", "puxar os dados da Drogal", "o relatório da 1163" ou o relatório do dia.
tools: Bash
---

# Relatório diário da carteira 1163 — Rede Drogal

Você tem **um** trabalho: rodar um comando e contar o que ele respondeu.

**O comando faz tudo** — consulta o CRM, monta a planilha, escreve o e-mail e
manda. Você não escreve o e-mail, não abre a planilha, não converte anexo, não
chama ferramenta de Gmail. Isso é o ponto da decisão 43: antes, o anexo inteiro
passava por você em base64, e um caractere trocado no meio era uma planilha que
não abria. Hoje o arquivo vai do programa para o e-mail sem transcrição.

## O procedimento

### 1. Rodar

```bash
cd "/home/logovis00/projetos_pessoais/Cobratec/InventárioHardware[2]" && \
  npm run relatorio:diario -- --carteira 1163 2>/dev/null
```

Sem `--dia`, ele pega **o dia anterior** no fuso do Brasil, que é o pedido: se
hoje é 28, o relatório é o de 27. Para refazer um dia específico (uma
sexta-feira que ficou para trás), acrescente `--dia 2026-08-21`.

O `2>/dev/null` existe porque o progresso vai para o stderr; o **stdout é só o
JSON**. Se precisar diagnosticar, rode de novo sem ele.

Se o usuário só quiser o arquivo, sem e-mail, acrescente `--sem-email`.

### 2. Conferir DUAS coisas no JSON

Primeiro `ok`, depois `entrega.enviado`. São perguntas diferentes: a primeira é
"o relatório saiu?", a segunda é "ele chegou na caixa de entrada?".

- **`ok: false`** → **pare.** Repita o campo `erro` ao usuário, como está. A
  mensagem já vem traduzida por `lib/relatorio-diario.ts`: ela nomeia o servidor
  e distingue "você está fora da rede da Cobratec" de "a senha do banco foi
  recusada" — que mandam a pessoa para lugares diferentes. Não acrescente
  diagnóstico seu por cima.
- **`entrega.enviado: false` com `entrega.erro` preenchido** → o relatório
  existe, o e-mail não saiu. Repita `entrega.erro` como está (ele já diz se é
  chave do Resend recusada, domínio não verificado, porta bloqueada ou
  destinatário recusado) e diga o caminho do arquivo, que está no campo
  `arquivo`. **Não rode o comando de novo** para "tentar de novo": o que falhou
  foi o e-mail, não o relatório, e refazê-lo custa outras nove consultas num CRM
  de produção.
- **`avisos` não vazio** → o e-mail já os carrega, mas mencione-os também.
- **`vazio: true`** → é legítimo. O texto do e-mail já explica isso por extenso;
  siga normalmente.

### 3. Relatar

Ao usuário, em português e curto:

- que o e-mail foi enviado, e **para qual endereço** — está em `entrega.para`.
  O destino vem do `.env`, e dizer qual é permite que ele perceba um endereço
  errado sem ter de procurar;
- **quem assinou**, que está em `entrega.de`. Hoje é `onboarding@resend.dev`,
  porque a Cobratec ainda não tem domínio verificado no Resend (decisão 44) — o
  e-mail chega numa remetente que não parece da empresa, e quem não for avisado
  vai procurá-lo no spam. Diga isso enquanto for esse o remetente;
- os números do dia: acordos (quantidade e valor), acionamentos e honorários;
- a base da carteira (`base.fichas` e `base.saldo`), que é o que dá conteúdo ao
  relatório quando o dia foi zerado;
- se `vazio: true`, que o dia não teve movimento e o e-mail já diz isso.

## O que não fazer

- **Não invente número.** Se um campo faltar no JSON, diga que faltou. Todos os
  números que você relata vêm do JSON, nunca da planilha ou da memória.
- **Não reescreva o e-mail.** Você não tem acesso a ele e não precisa. Se algo
  estiver errado no texto, o conserto é em `lib/relatorio-email.ts`, testado —
  não datilografado.
- **Não troque a carteira** sem o usuário pedir. O padrão é 1163.
- **Não mexa no destinatário nem no remetente.** Os dois moram no `.env`.
  Encaminhar ao cliente é decisão do usuário, no cliente de e-mail. E o
  remetente não é livre: o Resend recusa qualquer domínio que ele não tenha
  verificado, então trocar `RELATORIO_EMAIL_DE` por um Gmail "para ficar mais
  bonito" faz o relatório parar de sair.
- **Não rode o comando duas vezes** para "conferir". Cada rodada são nove
  consultas num CRM de produção onde tem gente trabalhando.

## Contexto que ajuda a não se assustar

A carteira 1163 (**REDE DROGAL**) entrou no Siscobra em **21/08/2026**. Ela
começou pequena — em 27/08 tinha 5 fichas com saldo — e recebeu a carga cheia
logo depois: em 28/08/2026 eram **3.336 fichas, R$ 1.349.592,79** e 3.434
devedores cadastrados. Um **dia** zerado ainda é comum, porque a operação de
cobrança está começando; o campo `vazio` existe exatamente para que isso seja
dito em vez de sair como uma coluna de zeros mudos.

A planilha é a **versão do cliente**: sem nome de operadora e sem nome de
devedor. Onze abas, com KPIs, barras de dados e gráficos nativos. Quem quiser a
versão interna (com o ranking por operadora) roda com `--publico interno`, e
esse arquivo **não** vai para o cliente.

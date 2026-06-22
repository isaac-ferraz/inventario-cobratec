# Deploy — Oracle Cloud (Always Free) + Docker

Guia para rodar o Inventário numa VM gratuita da Oracle Cloud, mantendo o
SQLite (em volume Docker) e o mesmo `docker compose` do projeto.

> **Por que não Vercel/GitHub Pages/Render free:** o banco é um arquivo SQLite
> que precisa de disco persistente. GitHub Pages é só estático (sem API). Vercel
> e Render free têm filesystem efêmero → o banco seria apagado a cada deploy.
> Uma VM (Oracle Always Free) resolve isso sem trocar de banco.

## 1. Criar a VM

No console da Oracle Cloud → **Compute → Instances → Create**:

- **Shape:** `VM.Standard.A1.Flex` (ARM Ampere, **Always Free** — até 4 OCPU /
  24 GB no total gratuito). Comece com 1–2 OCPU e 6–12 GB.
  - Se der "Out of capacity", tente outro *Availability Domain* / região, ou
    repita mais tarde (capacidade ARM gratuita é disputada).
- **Imagem:** Ubuntu 22.04 (LTS).
- **SSH:** salve a chave privada (`.key`) — é como você entra na máquina.

> A imagem ARM funciona: o build roda na própria VM e o Prisma baixa o engine
> ARM/musl automaticamente (`binaryTargets` já cobre `native`).

## 2. Acessar e instalar o Docker

```bash
ssh -i sua-chave.key ubuntu@SEU_IP_PUBLICO

# Docker + plugin do compose
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu      # usar docker sem sudo (relogar depois)
sudo systemctl enable --now docker  # sobe o Docker no boot
exit                                # saia e entre de novo p/ valer o grupo
```

## 3. Acesso seguro — escolha UMA opção

O app guarda **senhas em texto puro** (cofre interno de TI). **Não exponha
direto na internet.** Duas formas gratuitas:

### Opção A — Tailscale (recomendada: privada, sem abrir portas)
Rede privada criptografada; só quem está na sua conta acessa.
```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```
Depois acesse por `http://IP-DO-TAILSCALE:3000`. **Não** precisa abrir firewall
nem HTTPS. Instale o Tailscale também nos PCs/celulares do time.

### Opção B — URL pública com HTTPS + Basic Auth
Só se realmente precisar de URL aberta. Exige:
- **Ligar a Basic Auth** (passo 5).
- **Abrir a porta** nos DOIS firewalls da Oracle:
  - VCN → *Security List* → Ingress 0.0.0.0/0 na porta 443 (e 80).
  - Na VM: `sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT` (as imagens
    Oracle bloqueiam por padrão) — ou use `ufw`.
- Um **proxy com HTTPS** (ex.: Caddy, que emite Let's Encrypt sozinho) na frente
  do container. Peça que a gente monte o `Caddyfile` se for por aqui.

## 4. Clonar o repositório

O repo é **privado**. Autentique com a CLI do GitHub ou um token:
```bash
sudo apt-get update && sudo apt-get install -y git gh
gh auth login          # siga o passo a passo (device code)
git clone https://github.com/isaac-ferraz/inventario-cobratec.git
cd inventario-cobratec
```

## 5. (Opcional) Ligar a Basic Auth

```bash
cat > .env <<'EOF'
BASIC_AUTH_USER=ti
BASIC_AUTH_PASS=troque-esta-senha-forte
EOF
```
O `.env` não vai pro git. Sem essas variáveis, a auth fica desligada.

## 6. Levar os dados existentes (opcional, mas é o que você quer)

Seus dados atuais estão num `dev.db` consolidado em
`backups/dev-seed-para-servidor.db` (na sua máquina). Mande pro servidor:

```bash
# NA SUA MÁQUINA:
scp -i sua-chave.key backups/dev-seed-para-servidor.db \
    ubuntu@SEU_IP:/home/ubuntu/dev-seed.db
```

Crie o volume e injete o banco **com o dono certo (uid 1001 = usuário do
container)** — senão dá "disk I/O error":
```bash
# NO SERVIDOR:
docker volume create inventario-cobratec_inventario-db
docker run --rm \
  -v inventario-cobratec_inventario-db:/dst \
  -v /home/ubuntu:/in alpine sh -c \
  "cp /in/dev-seed.db /dst/dev.db && chown -R 1001:1001 /dst && chmod 644 /dst/dev.db"
```
> **Importante:** copie **só o `dev.db`** (sem `-wal`/`-shm`) e sempre faça
> `chown 1001:1001`. Pular isso causa "disk I/O error" ou banco corrompido.

Se NÃO quiser trazer dados, pule este passo: o app sobe com o banco vazio e o
catálogo de tipos é semeado automaticamente.

## 7. Subir

```bash
docker compose up -d --build
docker compose ps          # deve ficar (healthy)
docker compose logs -f     # acompanhar o boot (migrations + Ready)
```
O `docker-entrypoint.sh` roda `prisma migrate deploy` (cria/atualiza tabelas),
ativa o WAL e garante o catálogo. Acesse `http://IP:3000` (ou IP do Tailscale).

## 8. Manter rodando

- `restart: unless-stopped` no compose → o container volta sozinho se cair ou a
  VM reiniciar.
- `sudo systemctl enable docker` (passo 2) → o Docker sobe no boot.
- Healthcheck em `/api/health` já configurado.

## 9. Enviar atualizações (com o app no ar)

Fluxo padrão — downtime de poucos segundos:
```bash
cd inventario-cobratec
npm run db:backup 2>/dev/null || \
  docker run --rm -v inventario-cobratec_inventario-db:/d -v "$PWD/backups":/b \
    alpine sh -c "cp /d/dev.db /b/backup-$(date +%F-%H%M).db"  # backup antes
git pull
docker compose up -d --build      # rebuilda e recria o container
```
- Migrations novas são aplicadas sozinhas no boot.
- O volume preserva os dados entre updates.

## 10. Backup / restore

**Backup** (cópia consistente do volume):
```bash
docker run --rm -v inventario-cobratec_inventario-db:/d -v "$PWD/backups":/b \
  alpine sh -c "cp /d/dev.db /b/backup-$(date +%F-%H%M).db"
```
Leve para fora da VM com `scp`. **Restore:** mesmo procedimento do passo 6
(copiar o `dev.db` para o volume com `chown 1001:1001`).

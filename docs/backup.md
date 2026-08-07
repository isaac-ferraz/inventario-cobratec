# Backup do banco

O banco é **um arquivo SQLite**. Isso é uma vantagem (copiar é trivial) e um
risco: perder o arquivo é perder o inventário inteiro, incluindo o cofre de
credenciais. Este documento é o que fazer para isso não acontecer.

## O que o script faz

`scripts/backup-db.sh` (atalho: `npm run db:backup`):

1. Gera uma cópia consistente com `VACUUM INTO` — funciona **com o app rodando**
   e produz um único `.db` limpo, sem precisar dos auxiliares `-wal`/`-shm`
   (decisão 11 em [`decisoes.md`](./decisoes.md)).
2. Recusa-se a seguir se o arquivo sair vazio. Um backup de 0 byte é pior do que
   nenhum: passa despercebido até o dia em que você precisa dele.
3. Apaga os backups com mais de `BACKUP_DIAS` dias (padrão **30**), e só os que
   ele mesmo criou — casa pelo padrão `inventario-*.db`, nunca varre a pasta
   inteira, que pode ter cópias colocadas ali de propósito.

```bash
npm run db:backup                      # backups/inventario-AAAAMMDD-HHMMSS.db
BACKUP_DIAS=90 npm run db:backup       # guarda 90 dias
sh scripts/backup-db.sh /mnt/nas/inventario.db   # destino específico
```

## Agendar (escolha UMA)

> **A pasta `backups/` está no `.gitignore` e mora no mesmo disco do banco.**
> Backup que só existe na mesma máquina não protege contra o cenário mais comum
> (a máquina morrer). Aponte o destino para um pendrive, um compartilhamento de
> rede ou o NAS — ou copie para lá depois.

### Cron (mais simples)

`crontab -e` no usuário dono do projeto:

```cron
# Backup do inventário todo dia às 22h, depois do expediente.
0 22 * * * cd /caminho/do/InventarioHardware && /usr/bin/npm run db:backup >> /var/log/inventario-backup.log 2>&1
```

### systemd (log no journal, sobrevive a reboot)

`/etc/systemd/system/inventario-backup.service`:

```ini
[Unit]
Description=Backup do inventário de hardware
After=network.target

[Service]
Type=oneshot
User=SEU_USUARIO
WorkingDirectory=/caminho/do/InventarioHardware
Environment=BACKUP_DIAS=30
ExecStart=/usr/bin/npm run db:backup
```

`/etc/systemd/system/inventario-backup.timer`:

```ini
[Unit]
Description=Backup diário do inventário

[Timer]
OnCalendar=*-*-* 22:00:00
# Se a máquina estava desligada na hora marcada, roda assim que ligar.
Persistent=true

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now inventario-backup.timer
systemctl list-timers inventario-backup.timer   # confere o próximo disparo
sudo systemctl start inventario-backup.service  # testa agora, sem esperar
```

### Rodando em Docker

O banco vive no volume montado em `/app/data`. Rode o script **dentro** do
container e deixe a pasta de backup apontando para fora:

```cron
0 22 * * * docker compose -f /caminho/docker-compose.yml exec -T app npm run db:backup
```

## Restaurar

1. Pare o app (`docker compose down` ou `Ctrl+C` no `npm run dev`).
2. Substitua o banco pelo backup:
   ```bash
   cp backups/inventario-AAAAMMDD-HHMMSS.db prisma/dev.db
   rm -f prisma/dev.db-wal prisma/dev.db-shm   # restos da sessão anterior
   ```
3. Suba o app. As migrations já estão aplicadas dentro do backup.

## Confira de verdade

Backup nunca testado é fé, não é backup. Uma vez por semestre, restaure uma
cópia em outra pasta e abra:

```bash
cp backups/inventario-mais-recente.db /tmp/teste.db
DATABASE_URL="file:/tmp/teste.db" npx prisma studio
```

Se os computadores e funcionários aparecem, o backup presta.

-- Ativa o modo WAL (Write-Ahead Logging) no SQLite.
-- WAL permite leituras concorrentes com uma escrita em andamento (em vez de
-- bloquear o arquivo inteiro), o que reduz erros "database is locked" numa
-- ferramenta multiusuário. A configuração fica gravada no cabeçalho do arquivo
-- do banco — basta rodar uma vez (este script é idempotente). Ver docs/decisoes.md.
PRAGMA journal_mode = WAL;

"""Confere as travas do proxy do notebook do Colab (decisão 31.1).

    python3 docs/conversas/colab/testa-proxy.py

O proxy é a fronteira de segurança deste caminho: ele é a única coisa entre o
Ollama — que não tem autenticação nenhuma — e um endereço público que qualquer
um pode achar. Se ele deixar passar sem token, ou deixar passar uma rota que não
deveria, o modelo fica aberto para o mundo.

Roda à mão, e não no vitest, porque o código sob teste mora num .ipynb: o script
extrai a célula do proxy do próprio notebook e a executa contra um Ollama de
mentira. Assim o que é testado é o que está lá dentro, não uma cópia que
envelhece em silêncio. Se você mexer na célula 4 do notebook, rode isto.

Precisa de `flask` e `requests` instalados.
"""
import json, re, threading, time, http.server, socketserver
from pathlib import Path
import requests

NB = Path(__file__).with_name("ollama-colab.ipynb")

# ── Ollama de mentira na 11434 ────────────────────────────────────────────────
chamadas = []

class FalsoOllama(http.server.BaseHTTPRequestHandler):
    def _responde(self):
        chamadas.append((self.command, self.path))
        corpo = json.dumps({"message": {"content": '{"resposta":"oi"}'}}).encode()
        self.send_response(200)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    do_GET = do_POST = do_DELETE = _responde

    def log_message(self, *a):
        pass

socketserver.TCPServer.allow_reuse_address = True
# Porta alta: a 11434 pode ter um Ollama de verdade rodando na máquina.
falso = socketserver.TCPServer(("127.0.0.1", 0), FalsoOllama)
PORTA = falso.server_address[1]
threading.Thread(target=falso.serve_forever, daemon=True).start()

# A célula 4 do notebook define OLLAMA; aqui apontamos para o dublê.
OLLAMA = f"http://127.0.0.1:{PORTA}"

# ── extrai do notebook só o pedaço do proxy (o que vem antes do túnel) ────────
# O corte é uma marca combinada dentro da própria célula, e não um comentário
# qualquer que por acaso está no meio: o marcador antigo ("# Túnel do
# Cloudflare") foi parar dentro de um `if` quando o ngrok entrou, e cortar ali
# passou a produzir um `if` sem corpo — SyntaxError no lugar de teste.
CORTE = "testa-proxy.py corta a célula NESTA linha"
nb = json.load(open(NB))
celula = "".join(nb["cells"][8]["source"])
if celula.count(CORTE) != 1:
    raise SystemExit(
        f"a marca de corte não está exatamente uma vez na célula 4 "
        f"(achei {celula.count(CORTE)}) — o notebook mudou, ajuste este script"
    )
proxy = celula.split(CORTE)[0]
exec(compile(proxy, "celula-do-proxy", "exec"), globals())

# A célula escolhe a porta na hora e a publica em PORTA; ela também espera o
# servidor atender antes de seguir.
BASE = f"http://127.0.0.1:{PORTA}"

# Conferir que quem responde é O NOSSO proxy, e não outro programa que por acaso
# está na porta. Isto não é paranoia: rodando com a porta fixa em 8000, outro
# serviço da máquina respondeu 401 a tudo e o teste "passou" nas travas de
# recusa — provando nada, porque o proxy nem tinha subido. Teste que valida o
# servidor errado é pior que teste nenhum.
sonda = requests.get(f"{BASE}/api/tags", timeout=5)
if sonda.status_code != 401 or "token inválido" not in sonda.text:
    raise SystemExit(
        f"quem respondeu em {BASE} não é o proxy do notebook "
        f"(status {sonda.status_code}, corpo {sonda.text[:80]!r})"
    )
bom = {"Authorization": f"Bearer {TOKEN}"}
falhas = []

def confere(nome, obtido, esperado):
    ok = obtido == esperado
    print(f"{'ok  ' if ok else 'FALHA'} {nome}: {obtido} (esperado {esperado})")
    if not ok:
        falhas.append(nome)

confere("sem token -> 401",
        requests.get(f"{BASE}/api/tags", timeout=5).status_code, 401)
confere("token errado -> 401",
        requests.get(f"{BASE}/api/tags", timeout=5,
                     headers={"Authorization": "Bearer chutado"}).status_code, 401)
confere("token certo -> 200",
        requests.get(f"{BASE}/api/tags", timeout=5, headers=bom).status_code, 200)
confere("chat com token -> 200",
        requests.post(f"{BASE}/api/chat", timeout=5, headers=bom,
                      json={"model": "m"}).status_code, 200)
confere("rota fora da lista (delete) -> 403",
        requests.post(f"{BASE}/api/delete", timeout=5, headers=bom).status_code, 403)
confere("chat por GET (método errado) -> 403",
        requests.get(f"{BASE}/api/chat", timeout=5, headers=bom).status_code, 403)

# A pergunta que importa: o que foi barrado NÃO pode ter chegado ao Ollama.
vazou = [c for c in chamadas if "delete" in c[1]]
confere("nada barrado chegou ao Ollama", vazou, [])
print("\nchegou ao Ollama:", chamadas)

# ── o leitor de URL do túnel: desiste em vez de pendurar? ─────────────────────
leitor = celula.split(CORTE)[1]
tem_prazo = "prazo" in leitor and "queue.Empty" in leitor
confere("leitor do túnel tem prazo e trata fila vazia", tem_prazo, True)
padrao = re.search(r'r"(https://[^"]+trycloudflare[^"]+)"', leitor).group(1)
achou = re.search(padrao, "INF |  https://a-b-c.trycloudflare.com  |")
confere("regex do túnel casa com a saída real",
        achou.group(0) if achou else None, "https://a-b-c.trycloudflare.com")

falso.shutdown()
print("\n" + ("TUDO PASSOU" if not falhas else f"FALHARAM: {falhas}"))
raise SystemExit(1 if falhas else 0)

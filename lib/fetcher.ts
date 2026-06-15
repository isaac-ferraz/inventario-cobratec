// Helpers de fetch para os componentes client.
//
// O ponto central é SEMPRE checar `res.ok`. Sem isso, uma resposta de erro
// (ex: 500 com `{ erro: "..." }`) seria tratada como dado válido — e um
// `setLista(objeto)` seguido de `.map`/`.filter` quebraria a tela inteira.
// Aqui o erro vira uma exceção com a mensagem amigável da API.

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function mensagemDeErro(res: Response): Promise<string> {
  try {
    const j = await res.json();
    if (j && typeof j.erro === "string") return j.erro;
  } catch {
    // corpo não-JSON; cai no genérico abaixo
  }
  return `Erro ${res.status} ao falar com o servidor.`;
}

// GET tipado. Lança ApiError em resposta não-ok.
export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(await mensagemDeErro(res), res.status);
  return res.json() as Promise<T>;
}

// POST/PATCH/DELETE com corpo opcional. Lança ApiError em resposta não-ok.
export async function apiSend<T = unknown>(
  url: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new ApiError(await mensagemDeErro(res), res.status);
  // Algumas respostas (ex: DELETE) podem não ter corpo útil.
  return res.json().catch(() => ({} as T));
}

// Extrai uma mensagem exibível de qualquer erro capturado.
export function mensagem(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error && e.message) return e.message;
  return "Erro inesperado.";
}

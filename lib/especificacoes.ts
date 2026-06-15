// (De)serialização das especificações livres de componente.
// No SQLite o campo é guardado como texto JSON; aqui convertemos para objeto
// nas respostas da API e para texto na escrita.

export function serializar(
  esp: Record<string, unknown> | null | undefined,
): string | null {
  if (!esp) return null;
  if (Object.keys(esp).length === 0) return null;
  return JSON.stringify(esp);
}

export function desserializar(
  texto: string | null,
): Record<string, unknown> | null {
  if (!texto) return null;
  try {
    const obj = JSON.parse(texto);
    return obj && typeof obj === "object" ? obj : null;
  } catch {
    return null;
  }
}

// Tipos com campo `especificacoes` em texto (como vêm do Prisma).
type ComEsp = { especificacoes: string | null };

// Substitui o campo string por objeto, para enviar ao cliente.
export function expandirComponente<T extends ComEsp>(comp: T) {
  return { ...comp, especificacoes: desserializar(comp.especificacoes) };
}

export function expandirComponentes<T extends ComEsp>(comps: T[]) {
  return comps.map(expandirComponente);
}

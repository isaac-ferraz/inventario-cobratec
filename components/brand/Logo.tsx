import { Wordmark } from "./Wordmark";

/**
 * Logo oficial da Cobratec: o símbolo vetorizado (SVG inline, à esquerda) ao
 * lado do wordmark "Cobratec / Desde 1987". Copiado do site institucional —
 * são repositórios separados, então é cópia, não import cruzado.
 *
 * - `brand` → usa `--brand-blue`, que já vira sozinho no tema escuro
 *   (ver app/globals.css). Quem chama não precisa saber qual tema está ativo.
 * - `light` → branco, para quando o fundo é sempre escuro.
 *
 * Tudo é SVG inline com `currentColor`: nítido em qualquer tamanho, sem raster,
 * e recolorível pelo tema. O tamanho vem do `className` quando ele traz uma
 * utilidade de altura do Tailwind (ex.: `h-8`); senão cai no `height` em pixels.
 *
 * `markOnly` rende só o símbolo e `wordOnly` só o wordmark — para o cabeçalho
 * compacto do mobile, onde não cabe o conjunto. Os dois modos são decorativos
 * (`aria-hidden`): quem usa precisa envolvê-los num elemento rotulado (o
 * `<Link aria-label>` da navegação). O `Logo` completo já traz o próprio
 * `role="img"` com rótulo, para uso solto (tela de login).
 */
type Tone = "brand" | "light";

// Vectorized symbol: XOR (fill-rule evenodd) of the lower-left triangle and the
// centered circle — reconstructed from the official artwork. `currentColor` so
// tone controls the fill.
const MARK_PATH =
  "M0 0 L0 66 L66 66 Z M6.25 33 a26.75 26.75 0 1 0 53.5 0 a26.75 26.75 0 1 0 -53.5 0 Z";

export function Logo({
  tone = "brand",
  className = "",
  height = 48,
  markOnly = false,
  wordOnly = false,
}: {
  tone?: Tone;
  className?: string;
  height?: number;
  markOnly?: boolean;
  wordOnly?: boolean;
}) {
  // If the caller sizes the lockup via a Tailwind height class, defer to it;
  // otherwise apply the pixel `height` inline (inline style would block the class).
  const classSized = /(^|\s)(h-|max-h-|min-h-)/.test(className);
  const wrapStyle = classSized ? undefined : { height };

  // The whole lockup is one solid color; tone drives it via `currentColor`.
  const color = tone === "light" ? "#FFFFFF" : "var(--brand-blue)";

  const mark = (
    <svg
      viewBox="0 0 66 66"
      className="block h-full w-auto flex-none"
      style={{ color }}
      aria-hidden="true"
    >
      <path fill="currentColor" fillRule="evenodd" d={MARK_PATH} />
    </svg>
  );

  if (markOnly) {
    return (
      <span aria-hidden="true" className={`inline-block ${className}`} style={wrapStyle}>
        {mark}
      </span>
    );
  }

  if (wordOnly) {
    return (
      <span aria-hidden="true" className={`inline-block ${className}`} style={{ ...wrapStyle, color }}>
        <Wordmark className="block h-full w-auto" />
      </span>
    );
  }

  return (
    <span
      role="img"
      aria-label="Grupo Cobratec — desde 1987"
      className={`inline-flex items-center gap-[0.42em] ${className}`}
      style={{ ...wrapStyle, color }}
    >
      {mark}
      <Wordmark className="block w-auto flex-none" style={{ height: "84%", width: "auto" }} />
    </span>
  );
}

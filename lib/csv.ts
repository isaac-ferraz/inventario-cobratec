// Leitura e escrita de CSV — sem dependência nova (CLAUDE.md: projeto enxuto).
//
// O arquivo que chega aqui vem do Excel de alguém, então o parser tem de
// aguentar o que o Excel brasileiro produz de verdade:
//
//  - delimitador `;` (padrão do Excel em pt-BR, porque a vírgula é decimal);
//  - BOM UTF-8 no começo do arquivo (o Excel escreve, e sem tratar ele cola no
//    nome da primeira coluna e nenhum cabeçalho casa);
//  - CRLF entre linhas;
//  - campo entre aspas com delimitador, quebra de linha ou aspas duplicadas
//    ("" dentro do campo) no meio.
//
// O cabeçalho é normalizado (minúsculas, sem acento, sem espaço) para que
// "Funcionário", "funcionario" e "FUNCIONARIO " sejam a mesma coluna.

/** Tira o BOM, que senão vira parte do nome da primeira coluna. */
function semBom(texto: string): string {
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/**
 * Descobre o delimitador contando ocorrências FORA de aspas na primeira linha.
 * Contar no arquivo inteiro erraria: um campo de observação cheio de vírgulas
 * venceria o `;` que separa as colunas.
 */
export function detectarDelimitador(texto: string): string {
  const candidatos = [";", ",", "\t", "|"];
  const contagem = new Map<string, number>(candidatos.map((c) => [c, 0]));
  let dentroDeAspas = false;

  for (const ch of semBom(texto)) {
    if (ch === '"') dentroDeAspas = !dentroDeAspas;
    else if (!dentroDeAspas && (ch === "\n" || ch === "\r")) break;
    else if (!dentroDeAspas && contagem.has(ch)) {
      contagem.set(ch, contagem.get(ch)! + 1);
    }
  }

  let melhor = ";";
  let max = 0;
  for (const c of candidatos) {
    const n = contagem.get(c)!;
    if (n > max) {
      max = n;
      melhor = c;
    }
  }
  // Nenhum delimitador na primeira linha = arquivo de uma coluna só; `;` serve.
  return max === 0 ? ";" : melhor;
}

/**
 * CSV cru → matriz de células. Máquina de estado de um passo só; nada de regex,
 * que não dá conta de aspas com quebra de linha dentro.
 */
export function analisarCsv(texto: string, delimitador?: string): string[][] {
  const conteudo = semBom(texto);
  const d = delimitador ?? detectarDelimitador(conteudo);
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let dentroDeAspas = false;

  for (let i = 0; i < conteudo.length; i++) {
    const ch = conteudo[i];

    if (dentroDeAspas) {
      if (ch === '"') {
        // "" dentro de campo entre aspas = uma aspa literal.
        if (conteudo[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          dentroDeAspas = false;
        }
      } else {
        campo += ch;
      }
      continue;
    }

    if (ch === '"') {
      dentroDeAspas = true;
    } else if (ch === d) {
      linha.push(campo);
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      // \r\n conta como uma quebra só.
      if (ch === "\r" && conteudo[i + 1] === "\n") i++;
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else {
      campo += ch;
    }
  }

  // Último campo/linha, quando o arquivo não termina em quebra.
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  // Linha totalmente vazia (só delimitadores ou nada) não é dado.
  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

/** "Funcionário " → "funcionario". Base do casamento de colunas. */
/**
 * Minúsculas sem acento, PRESERVANDO os outros caracteres. Existe separado de
 * `normalizarCabecalho` porque comparar valor de célula precisa disto sem perder
 * pontuação: "-" (que o TI usa para "não") sobrevive aqui e desapareceria lá.
 */
export function semAcentos(texto: string): string {
  return (
    texto
      .normalize("NFD")
      // ̀-ͯ = marcas de acento que o NFD separou da letra.
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
  );
}

export function normalizarCabecalho(nome: string): string {
  return semAcentos(nome).replace(/[^a-z0-9]/g, "");
}

export type Registro = {
  /** Número da linha NO ARQUIVO (1 é o cabeçalho), para a mensagem de erro. */
  linha: number;
  celulas: Record<string, string>;
};

export type LeituraCsv = {
  cabecalho: string[];
  /** Cabeçalho normalizado, na ordem original. */
  chaves: string[];
  registros: Registro[];
  delimitador: string;
};

/**
 * Matriz → registros com chave normalizada. Linha mais curta que o cabeçalho
 * tem as células que faltam como "" (o Excel corta a linha quando o resto está
 * vazio); célula sobrando é ignorada.
 */
export function lerCsv(texto: string, delimitador?: string): LeituraCsv {
  const d = delimitador ?? detectarDelimitador(semBom(texto));
  const matriz = analisarCsv(texto, d);
  if (matriz.length === 0) {
    return { cabecalho: [], chaves: [], registros: [], delimitador: d };
  }

  const cabecalho = matriz[0].map((c) => c.trim());
  const chaves = cabecalho.map(normalizarCabecalho);

  const registros: Registro[] = matriz.slice(1).map((linha, i) => {
    const celulas: Record<string, string> = {};
    chaves.forEach((chave, col) => {
      if (!chave) return;
      celulas[chave] = (linha[col] ?? "").trim();
    });
    return { linha: i + 2, celulas };
  });

  return { cabecalho, chaves, registros, delimitador: d };
}

/**
 * Escreve CSV para o modelo que o TI baixa. Sempre com `;` e CRLF: é o que o
 * Excel em pt-BR abre com as colunas já separadas, sem passar pelo assistente
 * de importação.
 */
export function gerarCsv(cabecalho: string[], linhas: string[][]): string {
  const celula = (v: string) =>
    /[";\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return [cabecalho, ...linhas]
    .map((l) => l.map(celula).join(";"))
    .join("\r\n");
}

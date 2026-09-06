// El poquito de markdown que escribe Turbo, convertido en estructura.
//
// Módulo PURO y separado del componente para poder testearlo: el parseo es
// donde están los errores sutiles, no en el dibujo.
//
// Por qué existe: el chat mostraba el texto crudo, así que un mensaje de Turbo
// se veía literalmente `**Cargos:** fundador, CEO` — con los asteriscos a la
// vista. Parecía un error del sistema.
//
// Es un parser propio y no una librería porque Turbo usa un subconjunto mínimo,
// y sobre todo porque devuelve DATOS: el componente construye elementos de
// React a partir de esto y nunca HTML, así que la inyección es imposible por
// construcción.

/** Un pedacito de texto con su énfasis. */
export interface InlineToken {
  kind: 'text' | 'bold' | 'italic' | 'code';
  text: string;
}

export type Block =
  | { type: 'p'; tokens: InlineToken[] }
  | { type: 'ul'; items: InlineToken[][] }
  | { type: 'space' };

// El orden importa: `**` tiene que probarse antes que `*`, y `__` antes que `_`.
const INLINE_RE = /(\*\*[^*]+\*\*|__[^_]+__|\*[^*\n]+\*|_[^_\n]+_|`[^`\n]+`)/g;

/** Parte una línea en tramos con y sin énfasis. */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let ultimo = 0;
  let match: RegExpExecArray | null;
  INLINE_RE.lastIndex = 0;

  while ((match = INLINE_RE.exec(text)) !== null) {
    if (match.index > ultimo) {
      tokens.push({ kind: 'text', text: text.slice(ultimo, match.index) });
    }
    const t = match[0];
    if (t.startsWith('**') || t.startsWith('__')) {
      tokens.push({ kind: 'bold', text: t.slice(2, -2) });
    } else if (t.startsWith('`')) {
      tokens.push({ kind: 'code', text: t.slice(1, -1) });
    } else {
      tokens.push({ kind: 'italic', text: t.slice(1, -1) });
    }
    ultimo = match.index + t.length;
  }

  if (ultimo < text.length) tokens.push({ kind: 'text', text: text.slice(ultimo) });
  // Un texto vacío igual devuelve un token: así el que dibuja no tiene que
  // preguntarse si la lista puede venir vacía.
  return tokens.length > 0 ? tokens : [{ kind: 'text', text: '' }];
}

/** ¿Esta línea es una viñeta? Se aceptan `-`, `*` y `•`. */
export function bulletOf(linea: string): string | null {
  const m = /^\s*[-*•]\s+(.*)$/.exec(linea);
  return m ? m[1] : null;
}

/** El mensaje entero, listo para dibujar. */
export function parseChatMarkdown(text: string): Block[] {
  const bloques: Block[] = [];
  let viñetas: InlineToken[][] = [];

  const cerrarLista = () => {
    if (viñetas.length === 0) return;
    bloques.push({ type: 'ul', items: viñetas });
    viñetas = [];
  };

  for (const linea of text.split('\n')) {
    const viñeta = bulletOf(linea);
    if (viñeta !== null) {
      viñetas.push(parseInline(viñeta));
      continue;
    }
    cerrarLista();

    if (linea.trim() === '') {
      // Una línea en blanco separa párrafos, pero no al principio ni dos
      // seguidas: eso abriría huecos enormes dentro de una burbuja.
      const anterior = bloques[bloques.length - 1];
      if (bloques.length > 0 && anterior?.type !== 'space') bloques.push({ type: 'space' });
      continue;
    }
    bloques.push({ type: 'p', tokens: parseInline(linea) });
  }
  cerrarLista();

  return bloques;
}

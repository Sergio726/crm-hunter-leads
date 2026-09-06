// El mint es relleno, no tinta.
//
// Existe por lo que quedó al mergear el rediseño móvil (PR #82). La rama salió
// de antes del rebranding, cuando `primary` en tema claro era un verde profundo
// legible; en la paleta actual `primary` es el mint `#02ffc4` en los DOS temas,
// con `primaryDark` reservado para lo que va en primer plano.
//
// Al juntar las dos cosas, cada `color: colors.primary` que antes se leía pasó
// a medir **1.21:1 sobre el fondo claro y 1.30:1 sobre tarjeta blanca** — y el
// tema claro es el predeterminado. No rompía la compilación ni se veía en el
// diff: simplemente el texto se volvía invisible para la mayoría.
//
// La regla: `primary` solo como superficie (`backgroundColor`, `shadowColor`),
// siempre con `onPrimary` encima. Lo que va en primer plano usa `primaryDark`,
// que en claro es `#08785f` (5.04:1) y en oscuro `#b8ffef` (17.68:1).

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const mobile = join(import.meta.dirname, '..', '..', 'mobile', 'src');

function archivos(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) return archivos(ruta);
    return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
  });
}

/** Sin comentarios: si no, una línea comentada haría pasar el test igual. */
function leer(ruta: string): string {
  return readFileSync(ruta, 'utf8')
    .split('\n')
    .map((linea) => linea.replace(/\/\/.*$/, ''))
    .join('\n');
}

/**
 * Las formas en que un color termina en primer plano: el `color` de un `Text`
 * o de un `Ionicons`, y el `tintColor` del spinner de "deslizar para
 * actualizar" —los tres casos que aparecieron de verdad—.
 */
const EN_PRIMER_PLANO = /\b(?:color|tintColor)\s*[:=]\s*\{?\s*colors\.primary\b(?!Dark)/g;

describe('el mint no se usa como tinta de primer plano', () => {
  const fuentes = archivos(mobile).map((ruta) => ({ ruta, codigo: leer(ruta) }));

  it('hay archivos que leer (si no, el test no probaría nada)', () => {
    assert.ok(fuentes.length >= 10, `esperaba al menos 10 archivos, hay ${fuentes.length}`);
  });

  it('alguien usa la paleta (si no, el test pasaría por vacío)', () => {
    const conPaleta = fuentes.filter(({ codigo }) => codigo.includes('colors.primary'));
    assert.ok(conPaleta.length >= 3, `esperaba al menos 3 archivos con la paleta, hay ${conPaleta.length}`);
  });

  for (const { ruta, codigo } of fuentes) {
    const usos = codigo.match(EN_PRIMER_PLANO);
    if (!usos) continue;
    it(`${ruta.split(/[\\/]src[\\/]/)[1]} no pinta texto ni iconos con el mint`, () => {
      assert.fail(
        `usa el mint en primer plano (${usos.join(', ')}): sobre fondo claro mide 1.21:1. ` +
          'Para texto e iconos va `colors.primaryDark`; `colors.primary` es superficie.',
      );
    });
  }
});

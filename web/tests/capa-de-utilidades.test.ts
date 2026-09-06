// Un efecto que pisa utilidades de Tailwind no puede vivir en `@layer components`.
//
// Existe por lo que pasó con `.surface-lift` en el PR #85. La clase daba
// elevación al pasar el mouse —cambiaba `border-color` y `box-shadow`— y estaba
// definida dentro de `@layer components`. Pero las tarjetas que la usan
// (`Card`, `StatCard`, `EmptyState`) traen `border-border` y `shadow-sm`, que
// son **utilidades**. En CSS, cuando hay capas declaradas, **el orden de capa le
// gana a la especificidad**: `utilities` va después de `components`, así que
// `.shadow-sm` (0,1,0) pisaba a `.surface-lift:hover` (0,2,0) igual.
//
// Resultado: el hover no se veía nunca, y `StatCard` encima había perdido el
// `hover:shadow-md` que sí funcionaba. Nada fallaba al compilar — el efecto
// simplemente no existía. Es el mismo tipo de error invisible que BRAND-4.
//
// La regla: si una clase propia sobreescribe una propiedad que también da una
// utilidad (`border-color`, `box-shadow`, `background`, `color`), va declarada
// con `@utility`, que la deja en la capa `utilities`. Ahí manda la
// especificidad y el selector con `:hover` gana como corresponde.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

const globals = join(import.meta.dirname, '..', 'src', 'app', 'globals.css');

/** Sin comentarios: uno de bloque podría hacer pasar el test por accidente. */
function leer(): string {
  return readFileSync(globals, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
}

/** El cuerpo de `@layer components { … }`, con las llaves balanceadas. */
function capaComponents(css: string): string {
  const inicio = css.indexOf('@layer components {');
  assert.notEqual(inicio, -1, 'globals.css ya no declara @layer components');
  let profundidad = 0;
  for (let i = css.indexOf('{', inicio); i < css.length; i++) {
    if (css[i] === '{') profundidad++;
    else if (css[i] === '}' && --profundidad === 0) return css.slice(inicio, i);
  }
  throw new Error('@layer components quedó sin cerrar');
}

/** Propiedades que Tailwind también emite como utilidad, y por eso pisarían. */
const EN_DISPUTA = /(?:^|[;{\s])(border-color|box-shadow|background(?:-color)?|color)\s*:/;

describe('capa de utilidades', () => {
  it('hay CSS que leer', () => {
    const css = leer();
    assert.ok(css.includes('@layer components {'), 'globals.css ya no tiene capa de componentes');
    assert.ok(css.length > 2000, 'globals.css salió sospechosamente corto');
  });

  it('surface-lift se declara con @utility, no dentro de @layer components', () => {
    const css = leer();
    assert.match(css, /@utility\s+surface-lift\s*\{/);
    assert.ok(
      !capaComponents(css).includes('surface-lift'),
      'surface-lift volvió a @layer components: las utilidades de las tarjetas ' +
        'lo van a pisar y el hover no se va a ver',
    );
  });

  it('ninguna regla :hover de @layer components pelea contra una utilidad', () => {
    const componentes = capaComponents(leer());
    const culpables: string[] = [];

    // Cada bloque `selector { … }` de un solo nivel dentro de la capa.
    for (const [, selector, cuerpo] of componentes.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (!selector.includes(':hover') && !selector.includes(':focus')) continue;
      if (EN_DISPUTA.test(cuerpo)) culpables.push(selector.trim());
    }

    assert.deepEqual(
      culpables,
      [],
      `Estas reglas nunca se van a ver, porque las utilidades de Tailwind las ` +
        `pisan por orden de capa. Declaralas con @utility: ${culpables.join(', ')}`,
    );
  });
});

// Los canales que la base acepta y los que el código ofrece tienen que ser los
// mismos.
//
// Este bloque existe por el bug que arregla la 0054: la ficha abría el chat de
// Instagram y ahí se cortaba todo, porque el `check` de `interactions` no
// aceptaba ese canal. El contacto no quedaba en el historial, el cliente no
// pasaba a Contactado y no contaba para las métricas del vendedor. Nada de eso
// fallaba a la vista: simplemente no pasaba.
//
// Son cuatro listas separadas —el check de la base, los tipos de la web, los de
// la app móvil y los botones— y desincronizarlas no rompe ninguna compilación.
// Por eso se fijan acá.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { CHANNEL_LABELS } from '../src/lib/types';

const raiz = join(import.meta.dirname, '..', '..');

/**
 * Lee un archivo **sin sus comentarios**.
 *
 * No es un detalle: la primera versión de este test buscaba los canales con una
 * expresión regular sobre el archivo entero, así que comentar una línea lo
 * dejaba pasar igual — el canal seguía apareciendo, adentro del comentario. Se
 * descubrió justamente probando si el test fallaba al romper lo que vigila. Un
 * test que no falla ahí no prueba nada.
 */
function leer(...partes: string[]): string {
  return readFileSync(join(raiz, ...partes), 'utf8')
    .split('\n')
    .map((linea) => linea.replace(/\/\/.*$/, '').replace(/^\s*--.*$/, ''))
    .join('\n');
}

/** Los valores del `check` de `interactions.channel`, sacados de la migración. */
function canalesQueAceptaLaBase(): string[] {
  const sql = leer('supabase', 'migrations', '0054_canal_instagram_linkedin.sql');
  const check = /check \(channel in \(([^)]+)\)\)/.exec(sql);
  assert.ok(check, 'no se encontró el check de canales en la 0054');
  return [...check[1].matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
}

/** Los nombres entre comillas de un bloque, en el orden en que están escritos. */
function entrecomillados(texto: string): string[] {
  return [...texto.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
}

describe('los canales de la base y los del código coinciden', () => {
  const deLaBase = canalesQueAceptaLaBase();

  it('la base acepta Instagram y LinkedIn', () => {
    assert.ok(deLaBase.includes('instagram'), `la base acepta: ${deLaBase.join(', ')}`);
    assert.ok(deLaBase.includes('linkedin'));
  });

  it('el tipo de la web tiene exactamente los de la base', () => {
    assert.deepEqual(Object.keys(CHANNEL_LABELS).sort(), [...deLaBase].sort());
  });

  it('la app móvil tiene los mismos', () => {
    // Se lee como texto y no se importa: es otro proyecto, con su propio
    // tsconfig. Si le falta uno, el historial del teléfono muestra un hueco
    // donde debería decir el canal — que es lo que pasaría al sumar Instagram
    // solo del lado de la web.
    const mobile = leer('mobile', 'src', 'lib', 'types.ts');
    const bloque = /export const CHANNEL_LABELS[^}]+}/.exec(mobile);
    assert.ok(bloque, 'no se encontró CHANNEL_LABELS en la app móvil');
    const suyos = [...bloque[0].matchAll(/^\s*([a-z]+):/gm)].map((m) => m[1]);
    assert.deepEqual(suyos.sort(), [...deLaBase].sort());
  });
});

describe('lo que la ficha y el tablero ofrecen', () => {
  // `note` no es un contacto: es un comentario suelto, con su propio camino en
  // la ficha, así que no se ofrece como forma de contactar.
  const contactables = canalesQueAceptaLaBase()
    .filter((c) => c !== 'note')
    .sort();

  it('la ficha puede registrar todo lo que la base acepta', () => {
    const drawer = leer('web', 'src', 'components', 'clientes', 'ClientDrawer.tsx');
    const bloque = /const REGISTRABLES = new Set<CanalDeContacto>\(\[([^\]]+)\]\)/.exec(drawer);
    assert.ok(bloque, 'no se encontró REGISTRABLES');
    assert.deepEqual(entrecomillados(bloque[1]).sort(), contactables);
  });

  it('el tablero ofrece los mismos que la ficha', () => {
    const dialog = leer('web', 'src', 'components', 'clientes', 'BoardMoveDialog.tsx');
    const bloque = /const CHANNELS: Channel\[\] = \[([^\]]+)\]/.exec(dialog);
    assert.ok(bloque, 'no se encontró la lista de canales del tablero');
    assert.deepEqual(entrecomillados(bloque[1]).sort(), contactables);
  });
});

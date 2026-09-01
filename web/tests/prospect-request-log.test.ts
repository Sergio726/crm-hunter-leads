// Tests del log de solicitudes y del cartel que ve el vendedor.
//
// Lo que se prueba acá es la distinción que costó dos diagnósticos: separar
// "busqué y no encontré a nadie" de "el proveedor nunca buscó". Se arreglan de
// formas opuestas, y confundirlas fue lo que dejó al usuario aflojando filtros
// que no tenían nada que ver con el problema.

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { outcomeFor } from '../src/lib/prospect/request-log';
import { problemFrom } from '../src/lib/prospect/provider-problem';

describe('outcomeFor', () => {
  it('con resultados es ok', () => {
    assert.equal(outcomeFor(12), 'ok');
  });

  it('sin resultados y sin aviso del proveedor es un cero de verdad', () => {
    // Buscó, pagó la página y no había nadie. Acá SÍ sirve tocar los filtros.
    assert.equal(outcomeFor(0), 'empty');
  });

  it('el aviso del proveedor manda sobre el conteo', () => {
    // Cero resultados NO significa "no hay nadie" si nunca se ejecutó la
    // búsqueda. Es el caso real del 2026-08-18.
    assert.equal(
      outcomeFor(0, 'Tu cuenta de Apify llegó al tope de corridas del plan gratis'),
      'provider_skipped',
    );
  });
});

describe('problemFrom', () => {
  // De qué se trata decide QUÉ CONSEJO se da, y los dos consejos son distintos.
  it('reconoce el tope de corridas', () => {
    assert.equal(
      problemFrom('Tu cuenta de Apify llegó al tope de corridas del plan gratis.'),
      'tope-corridas',
    );
    // También el texto crudo del actor, por si llega sin traducir.
    assert.equal(problemFrom('free user run limit reached'), 'tope-corridas');
  });

  it('reconoce la falta de crédito', () => {
    assert.equal(problemFrom('Tu cuenta de Apify se quedó sin crédito.'), 'sin-credito');
  });

  it('lo que no reconoce no inventa un consejo', () => {
    assert.equal(problemFrom('Se cayó la red.'), 'desconocido');
    assert.equal(problemFrom(null), 'desconocido');
  });

  it('el tope de corridas NO se confunde con falta de crédito', () => {
    // Es la distinción cara: con el tope, bajar la cantidad de resultados no
    // sirve para nada, y ofrecerlo sería mandar a probar algo imposible.
    assert.notEqual(problemFrom('free user run limit reached'), 'sin-credito');
  });
});

/**
 * El log solo sirve si la fila llega. Este bloque fija el bug del 2026-08-31.
 *
 * Entre el 19 y el 25 de agosto hubo tres búsquedas de LinkedIn que terminaron
 * en "el proveedor no ejecutó" —el caso exacto para el que se creó la tabla— y
 * el log no registró ninguna. La causa no era la migración ni los permisos: era
 * que las rutas hacían `void logRequest(...)`, y una escritura que nadie espera
 * se pierde cuando el entorno congela la función al devolver la respuesta.
 *
 * No se puede reproducir con un test unitario —hace falta el corte del entorno
 * serverless—, así que lo que se fija acá es la regla: **ninguna ruta dispara el
 * registro y se olvida**. Es lo que impide que el patrón vuelva a colarse.
 */
describe('el registro no se dispara y se olvida', () => {
  const rutas = join(import.meta.dirname, '..', 'src', 'app', 'api');

  function archivosDeRutas(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entrada) => {
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) return archivosDeRutas(ruta);
      return entrada.name.endsWith('.ts') ? [ruta] : [];
    });
  }

  const conLog = archivosDeRutas(rutas)
    .map((ruta) => ({ ruta, codigo: readFileSync(ruta, 'utf8') }))
    .filter(({ codigo }) => codigo.includes('logRequest'));

  it('hay rutas que registran (si no, el test no probaría nada)', () => {
    // Sin esta comprobación, borrar el log entero dejaría el test en verde.
    assert.ok(conLog.length >= 3, `esperaba al menos 3 rutas con log, hay ${conLog.length}`);
  });

  for (const { ruta, codigo } of conLog) {
    it(`${ruta.split(/[\\/]api[\\/]/)[1]} usa logRequestAfter`, () => {
      assert.ok(
        !/void\s+logRequest\s*\(/.test(codigo),
        'dispara el registro sin esperarlo: la fila se pierde en serverless. Usá logRequestAfter.',
      );
      // `logRequest` a secas solo vale esperada; lo normal es `logRequestAfter`.
      const sueltas = codigo.match(/(?<!await |After|\w)logRequest\s*\(/g) ?? [];
      assert.equal(sueltas.length, 0, `quedan llamadas sin esperar: ${sueltas.join(', ')}`);
    });
  }
});

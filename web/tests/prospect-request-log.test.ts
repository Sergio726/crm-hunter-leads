// Tests del log de solicitudes y del cartel que ve el vendedor.
//
// Lo que se prueba acá es la distinción que costó dos diagnósticos: separar
// "busqué y no encontré a nadie" de "el proveedor nunca buscó". Se arreglan de
// formas opuestas, y confundirlas fue lo que dejó al usuario aflojando filtros
// que no tenían nada que ver con el problema.

import assert from 'node:assert/strict';
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

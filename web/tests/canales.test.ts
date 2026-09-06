// Tests del catálogo de canales.
//
// El canal dejó de ser una lista suelta repetida en cada pantalla: es el lugar
// donde va a vivir "¿la app puede mandar esto sola?" cuando llegue el envío
// directo. Estos tests fijan que la lista no se desincronice de las reglas de
// redacción, que era lo que pasaba antes.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CANALES, CANALES_IDS, canal, canalesConEnvio, esCanal } from '../src/lib/canales';
import { CHANNEL_RULES } from '../src/lib/prospect/approach';

describe('el catálogo de canales', () => {
  it('están los cuatro, con Instagram incluido', () => {
    assert.deepEqual(CANALES_IDS, ['whatsapp', 'instagram', 'email', 'linkedin']);
  });

  it('cada canal tiene una regla de redacción', () => {
    // Si alguien agrega un canal y se olvida de la regla, el modelo escribiría
    // con el formato de otro medio.
    for (const c of CANALES) {
      assert.ok(CHANNEL_RULES[c.id], `falta la regla de ${c.id}`);
    }
  });

  it('la regla de Instagram habla de la primera línea', () => {
    // Es lo que define ese canal: el mensaje de alguien que no te sigue cae en
    // solicitudes y solo se ve el arranque.
    assert.match(CHANNEL_RULES.instagram, /primera línea/i);
  });

  it('ninguno manda solo todavía', () => {
    // Cuando alguno pase a `true`, la ficha tiene que ofrecer "Enviar" en vez
    // de "Copiar" — y este test se cambia a propósito, no por accidente.
    assert.deepEqual(canalesConEnvio(), []);
  });

  it('todos tienen una ayuda escrita para el vendedor', () => {
    for (const c of CANALES) {
      assert.ok(c.ayuda.length > 20, `${c.id} sin ayuda`);
      assert.ok(c.label.length > 0);
    }
  });
});

describe('esCanal', () => {
  it('acepta los que existen', () => {
    assert.equal(esCanal('whatsapp'), true);
    assert.equal(esCanal('instagram'), true);
  });

  it('rechaza cualquier otra cosa que llegue por la API', () => {
    assert.equal(esCanal('telegram'), false);
    assert.equal(esCanal(''), false);
    assert.equal(esCanal(null), false);
    assert.equal(esCanal(42), false);
    assert.equal(esCanal({ id: 'whatsapp' }), false);
  });
});

describe('canal', () => {
  it('devuelve la definición pedida', () => {
    assert.equal(canal('linkedin').label, 'LinkedIn');
  });

  it('ante uno desconocido cae en el primero en vez de romper', () => {
    // La pantalla siempre tiene que poder dibujar algo.
    assert.equal(canal('lo-que-sea' as never).id, 'whatsapp');
  });
});

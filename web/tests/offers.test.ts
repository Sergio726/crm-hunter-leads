// Tests de las ofertas y de cómo se elige la que corresponde a cada lead.
//
// Fijan el bug reportado por el usuario: un mensaje **para inmobiliarias** en un
// cliente que era **dueño de un gimnasio**. La causa era que "qué vendés" era
// una sola frase global, así que el rubro de la última búsqueda quedaba pegado
// y reaparecía en cualquier otro lead.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  elegirOferta,
  normalizeOffers,
  nuevoOfferId,
  rubroDeTags,
  type Offer,
} from '../src/lib/offers';

const INMO: Offer = {
  id: 'webs-inmo',
  nombre: 'Webs para inmobiliarias',
  texto: 'páginas web para inmobiliarias, listas en 10 días',
  rubros: ['inmobiliarias'],
};
const GYM: Offer = {
  id: 'webs-gym',
  nombre: 'Webs para gimnasios',
  texto: 'páginas web con reservas para gimnasios',
  rubros: ['fitness'],
};
const GENERICA: Offer = {
  id: 'webs',
  nombre: 'Páginas web',
  texto: 'páginas web, listas en 10 días',
  rubros: [],
};

describe('elegirOferta', () => {
  it('EL BUG: un gimnasio no recibe la oferta de inmobiliarias', () => {
    // Aunque la de inmobiliarias esté primera —como quedaba la frase pegada de
    // la última búsqueda—, manda el rubro del lead.
    const elegida = elegirOferta([INMO, GYM, GENERICA], 'fitness');
    assert.equal(elegida?.id, 'webs-gym');
  });

  it('cae a la genérica cuando ningún rubro coincide', () => {
    const elegida = elegirOferta([INMO, GYM, GENERICA], 'veterinarias');
    assert.equal(elegida?.id, 'webs');
  });

  it('sin rubro conocido del lead, también cae a la genérica', () => {
    // Un cliente cargado a mano puede no tener rubro: es el caso en que antes
    // el modelo lo deducía de la oferta.
    assert.equal(elegirOferta([INMO, GENERICA], null)?.id, 'webs');
  });

  it('sin genérica devuelve la primera, que es mejor que nada', () => {
    // El vendedor puede cambiarla en el selector; dejarlo sin oferta obligaría
    // a escribirla a mano justo cuando hay una lista cargada.
    assert.equal(elegirOferta([INMO, GYM], 'veterinarias')?.id, 'webs-inmo');
  });

  it('la lista vacía no rompe: devuelve null y el campo libre toma el lugar', () => {
    assert.equal(elegirOferta([], 'fitness'), null);
    assert.equal(elegirOferta([], null), null);
  });

  it('una oferta que sirve para varios rubros también aplica', () => {
    const varias: Offer = { ...GENERICA, id: 'multi', rubros: ['fitness', 'salud'] };
    assert.equal(elegirOferta([INMO, varias], 'salud')?.id, 'multi');
  });
});

describe('rubroDeTags', () => {
  it('encuentra el rubro entre las etiquetas del cliente', () => {
    // `promote_prospects` copia rubro y zona a los tags, en ese orden.
    assert.equal(rubroDeTags(['fitness', 'Córdoba']), 'fitness');
  });

  it('ignora lo que no es un rubro conocido', () => {
    // Un cliente importado por CSV puede tener cualquier etiqueta.
    assert.equal(rubroDeTags(['cliente-viejo', 'referido']), null);
  });

  it('encuentra el rubro aunque no venga primero', () => {
    assert.equal(rubroDeTags(['referido', 'veterinarias']), 'veterinarias');
  });

  it('"generico" no es un rubro: no sirve para elegir nada', () => {
    assert.equal(rubroDeTags(['generico']), null);
  });

  it('sin etiquetas devuelve null, no rompe', () => {
    assert.equal(rubroDeTags([]), null);
    assert.equal(rubroDeTags(null), null);
    assert.equal(rubroDeTags(undefined), null);
  });

  it('no le importan mayúsculas ni espacios', () => {
    assert.equal(rubroDeTags(['  Fitness ']), 'fitness');
  });
});

describe('normalizeOffers', () => {
  it('descarta lo que no sirve: sin texto no hay oferta', () => {
    const out = normalizeOffers([
      { id: 'a', nombre: 'Buena', texto: 'páginas web', rubros: ['fitness'] },
      { id: 'b', nombre: 'Vacía', texto: '   ', rubros: [] },
      { id: 'c', nombre: 'Corta', texto: 'web', rubros: [] },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].id, 'a');
  });

  it('lo que no es una lista devuelve vacío en vez de explotar', () => {
    // Puede venir de una versión vieja o de una edición a mano en la base.
    assert.deepEqual(normalizeOffers(null), []);
    assert.deepEqual(normalizeOffers('offers'), []);
    assert.deepEqual(normalizeOffers({ a: 1 }), []);
  });

  it('descarta rubros que no son texto y no pierde el resto', () => {
    const out = normalizeOffers([
      { id: 'a', nombre: 'X', texto: 'páginas web', rubros: ['fitness', 3, null, ''] },
    ]);
    assert.deepEqual(out[0].rubros, ['fitness']);
  });

  it('no deja dos ofertas con el mismo id', () => {
    // Dos con el mismo id romperían el selector, que elige por id.
    const out = normalizeOffers([
      { id: 'a', nombre: 'Una', texto: 'páginas web', rubros: [] },
      { id: 'a', nombre: 'Otra', texto: 'aplicaciones', rubros: [] },
    ]);
    assert.equal(out.length, 1);
    assert.equal(out[0].nombre, 'Una');
  });

  it('completa el nombre y el id cuando faltan', () => {
    const out = normalizeOffers([{ texto: 'páginas web, listas en 10 días' }]);
    assert.equal(out.length, 1);
    assert.ok(out[0].id.length > 0);
    assert.ok(out[0].nombre.length > 0);
  });
});

describe('nuevoOfferId', () => {
  it('hace un id legible a partir del nombre', () => {
    assert.equal(nuevoOfferId('Páginas Web', []), 'paginas-web');
  });

  it('no repite uno existente', () => {
    const previa: Offer = { id: 'paginas-web', nombre: 'x', texto: 'páginas web', rubros: [] };
    assert.equal(nuevoOfferId('Páginas Web', [previa]), 'paginas-web-2');
  });

  it('un nombre sin letras igual da un id usable', () => {
    assert.equal(nuevoOfferId('!!!', []), 'oferta');
  });
});

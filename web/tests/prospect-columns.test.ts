// Tests del decisor de columnas.
//
// El caso que originó todo: buscando personas en LinkedIn, la tabla mostraba la
// columna "Negocio", dejaba "Teléfono" y "Zona" vacías —LinkedIn no las da— y
// escondía cargo, empresa y email, que es justo lo que se paga por traer.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { labelsFor, visibleColumns, type RowLike } from '../src/lib/prospect/columns';

/** Una persona de LinkedIn, como llega de verdad. */
const persona: RowLike = {
  kind: 'person',
  roleTitle: 'CEO & Co-Founder',
  companyName: 'Kuvia',
  email: 'ana@kuvia.ai',
  area: 'Buenos Aires',
};

/** Un negocio recién encontrado en Google, sin enriquecer. */
const negocio: RowLike = {
  kind: 'business',
  whatsappPhone: '+5493514445566',
  area: 'Córdoba',
  rating: 4.6,
  reviewsCount: 120,
};

describe('labelsFor', () => {
  it('a una persona no la llama "Negocio"', () => {
    assert.equal(labelsFor('person').nombre, 'Persona');
    assert.equal(labelsFor('business').nombre, 'Negocio');
    assert.equal(labelsFor('account').nombre, 'Cuenta');
  });

  it('debajo del nombre de una persona va el cargo, no la dirección', () => {
    assert.equal(labelsFor('person').subtitulo, 'cargo');
    assert.equal(labelsFor('business').subtitulo, 'direccion');
  });

  it('sin tipo asume negocio, que es lo que había antes', () => {
    assert.equal(labelsFor(undefined).nombre, 'Negocio');
  });
});

describe('visibleColumns', () => {
  it('una persona muestra cargo y contacto, y NO señales de Google', () => {
    const col = visibleColumns([persona]);
    assert.equal(col.cargo, true);
    assert.equal(col.contacto, true);
    // Rating y reseñas no existen para una persona: la columna no se dibuja.
    assert.equal(col.senales, false);
    assert.equal(col.audiencia, false);
  });

  it('un negocio de Google muestra señales y contacto, y NO cargo', () => {
    const col = visibleColumns([negocio]);
    assert.equal(col.senales, true);
    assert.equal(col.contacto, true);
    assert.equal(col.cargo, false);
  });

  it('alcanza con que UNA fila lo tenga para dibujar la columna', () => {
    // Media lista enriquecida y media no sigue necesitando la columna.
    const col = visibleColumns([negocio, { ...negocio, audienceSize: 8000 }]);
    assert.equal(col.audiencia, true);
  });

  it('sin ningún dato de contacto, no se dibuja una columna de guiones', () => {
    const col = visibleColumns([{ kind: 'business', area: 'Córdoba' }]);
    assert.equal(col.contacto, false);
    assert.equal(col.zona, true);
  });

  it('una lista vacía no rompe ni dibuja nada', () => {
    const col = visibleColumns([]);
    assert.deepEqual(col, {
      cargo: false,
      contacto: false,
      senales: false,
      zona: false,
      audiencia: false,
    });
  });

  it('el email solo alcanza para abrir la columna de contacto', () => {
    // Es el caso de LinkedIn con búsqueda de email: no hay teléfono ni redes.
    const col = visibleColumns([{ kind: 'person', email: 'x@y.com' }]);
    assert.equal(col.contacto, true);
  });

  it('cero reseñas no cuenta como señal', () => {
    // `reviewsCount: 0` es un dato real que significa "no tiene", no una señal
    // para mostrar. Sin esto la columna aparecía siempre.
    const col = visibleColumns([{ kind: 'business', reviewsCount: 0, rating: null }]);
    assert.equal(col.senales, false);
  });
});

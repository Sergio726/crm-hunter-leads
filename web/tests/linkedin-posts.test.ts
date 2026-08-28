// Tests del último post del perfil.
//
// Lo que se fija acá es la decisión propia: **un post viejo no se ofrece**.
// Mencionar algo de hace ocho meses delata el bot más que no mencionar nada,
// porque nadie comenta hoy una publicación de otro semestre. El código del
// desafío de Nexum trae el post pero no mira la fecha.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COSTO_POR_POST_USD,
  POST_FRESCO_DIAS,
  costoDeTraerPosts,
  postEsFresco,
  recortarPost,
  slugDelItem,
} from '../src/lib/prospect/linkedin-posts';

const HOY = new Date('2026-08-27T12:00:00Z');

describe('postEsFresco', () => {
  it('uno de esta semana sirve', () => {
    assert.equal(postEsFresco('2026-08-24T10:00:00Z', HOY), true);
  });

  it('justo en el borde de los 60 días todavía sirve', () => {
    const borde = new Date(HOY.getTime() - POST_FRESCO_DIAS * 86_400_000).toISOString();
    assert.equal(postEsFresco(borde, HOY), true);
  });

  it('uno de hace ocho meses NO se usa', () => {
    assert.equal(postEsFresco('2025-12-20T10:00:00Z', HOY), false);
  });

  it('sin fecha no se arriesga', () => {
    // Si no sabemos cuándo se publicó, mencionarlo es una apuesta.
    assert.equal(postEsFresco(null, HOY), false);
    assert.equal(postEsFresco('cualquier cosa', HOY), false);
  });

  it('una fecha futura tampoco: es un dato roto', () => {
    assert.equal(postEsFresco('2027-01-01T00:00:00Z', HOY), false);
  });
});

describe('recortarPost', () => {
  it('un post corto pasa entero', () => {
    const t = 'Hoy cerramos el trimestre con el mejor número de la historia.';
    assert.equal(recortarPost(t), t);
  });

  it('normaliza saltos y espacios', () => {
    assert.equal(recortarPost('Hola\n\n  mundo   entero'), 'Hola mundo entero');
  });

  it('un post largo se corta en una frase completa', () => {
    const largo = 'Primera frase con algo de sustancia. ' + 'palabra '.repeat(120);
    const out = recortarPost(largo, 200) ?? '';
    assert.ok(out.length <= 201);
    assert.match(out, /[.…]$/);
  });

  it('lo que no dice nada se descarta', () => {
    // Un "…" o un emoji suelto no sirve para romper el hielo.
    assert.equal(recortarPost('...'), null);
    assert.equal(recortarPost(''), null);
    assert.equal(recortarPost(null), null);
    assert.equal(recortarPost(undefined), null);
  });
});

describe('slugDelItem', () => {
  it('saca el slug de la URL del autor', () => {
    assert.equal(
      slugDelItem({ authorProfileUrl: 'https://www.linkedin.com/in/juan-perez/' }),
      'in/juan-perez',
    );
  });

  it('acepta los otros nombres de campo del actor', () => {
    // El actor cambió nombres entre versiones.
    assert.equal(slugDelItem({ profileUrl: 'https://linkedin.com/company/acme' }), 'company/acme');
  });

  it('una URL que no es de perfil devuelve null', () => {
    assert.equal(slugDelItem({ url: 'https://ejemplo.com/algo' }), null);
    assert.equal(slugDelItem({}), null);
  });
});

describe('costoDeTraerPosts', () => {
  it('cuesta por perfil', () => {
    assert.equal(costoDeTraerPosts(1), COSTO_POR_POST_USD);
    assert.equal(Number(costoDeTraerPosts(20).toFixed(3)), 0.04);
  });

  it('ninguno no cuesta nada', () => {
    assert.equal(costoDeTraerPosts(0), 0);
    assert.equal(costoDeTraerPosts(-5), 0);
  });
});

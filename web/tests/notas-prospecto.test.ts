// Tests del parser de notas del prospecto.
//
// Lo reportó el usuario probando la app: en los clientes que ya existían, el
// mensaje "no lee los datos" y el link de Google Maps hay que copiarlo y
// pegarlo. La causa es la misma: esos datos viven como texto plano dentro de
// las notas.
//
// La regla que no se puede romper: **lo que escribió una persona nunca se
// pierde**. Todo lo demás es recuperable; eso no.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  rearmarNotas,
  separarNotas,
  tieneDatos,
  type DatosDelProspecto,
} from '../src/lib/notas-prospecto';

const REAL = [
  'Prospecto detectado por búsqueda.',
  'Score: 72',
  'Cargo: Dueño',
  'Instagram: @olimpo',
  'LinkedIn: https://www.linkedin.com/in/juan-perez',
  'Ficha: https://maps.google.com/?cid=123',
  'Sitio: https://olimpo.com.ar',
].join('\n');

describe('separarNotas', () => {
  it('saca cada dato del bloque que dejó la promoción', () => {
    const { datos } = separarNotas(REAL);
    assert.equal(datos?.score, 72);
    assert.equal(datos?.cargo, 'Dueño');
    assert.equal(datos?.instagram, 'olimpo');
    assert.equal(datos?.linkedin, 'in/juan-perez');
    assert.equal(datos?.mapsUrl, 'https://maps.google.com/?cid=123');
    assert.equal(datos?.website, 'https://olimpo.com.ar');
  });

  it('separa lo que escribió una persona', () => {
    const { datos, libres } = separarNotas(REAL + '\nLlamar después de las 18. Preguntó por el plan anual.');
    assert.equal(datos?.instagram, 'olimpo');
    assert.equal(libres, 'Llamar después de las 18. Preguntó por el plan anual.');
  });

  it('un cliente cargado a mano no tiene bloque: todo es nota humana', () => {
    const { datos, libres } = separarNotas('Me lo pasó Juan, llamar el lunes');
    assert.equal(datos, null);
    assert.equal(libres, 'Me lo pasó Juan, llamar el lunes');
  });

  it('sin notas no rompe', () => {
    assert.deepEqual(separarNotas(null), { datos: null, libres: '' });
    assert.deepEqual(separarNotas(''), { datos: null, libres: '' });
    assert.deepEqual(separarNotas('   '), { datos: null, libres: '' });
  });

  it('un bloque incompleto igual entrega lo que hay', () => {
    // La migración omite los campos vacíos, así que esto es lo normal.
    const { datos } = separarNotas('Prospecto detectado por búsqueda.\nFicha: https://maps.google.com/x');
    assert.equal(datos?.mapsUrl, 'https://maps.google.com/x');
    assert.equal(datos?.instagram, null);
    assert.equal(datos?.score, null);
  });

  it('una nota humana que arranca con algo parecido a un campo no se traga', () => {
    // Después de la primera línea que no es un campo conocido, todo es de la
    // persona — aunque escriba "Sitio: ..." más abajo.
    const { libres } = separarNotas(
      REAL + '\nHablé con la dueña.\nSitio: me dijo que lo están rehaciendo',
    );
    assert.match(libres, /Hablé con la dueña/);
    assert.match(libres, /me dijo que lo están rehaciendo/);
  });

  it('soporta saltos de línea de Windows', () => {
    const { datos } = separarNotas(REAL.replace(/\n/g, '\r\n'));
    assert.equal(datos?.cargo, 'Dueño');
  });
});

describe('rearmarNotas', () => {
  it('lo que entra vuelve a salir igual: nada se pierde al guardar', () => {
    const { datos, libres } = separarNotas(REAL + '\nLlamar el lunes');
    assert.equal(rearmarNotas(datos, libres), REAL + '\nLlamar el lunes');
  });

  it('editar la nota humana no toca el bloque', () => {
    const { datos } = separarNotas(REAL);
    const texto = rearmarNotas(datos, 'Nueva nota');
    assert.ok(texto?.includes('Ficha: https://maps.google.com/?cid=123'));
    assert.ok(texto?.includes('Nueva nota'));
  });

  it('vaciar la nota humana conserva los datos de la búsqueda', () => {
    // Es el caso peligroso: si el bloque no se rearmara, el primer guardado
    // borraría para siempre los datos de todos los clientes viejos.
    const { datos } = separarNotas(REAL);
    const texto = rearmarNotas(datos, '');
    assert.ok(texto?.includes('Instagram: @olimpo'));
  });

  it('sin bloque y sin nota devuelve null, no una cadena vacía', () => {
    // `clients.notes` acepta null: guardar '' dejaría basura en la base.
    assert.equal(rearmarNotas(null, ''), null);
    assert.equal(rearmarNotas(null, '   '), null);
  });

  it('un cliente sin búsqueda guarda solo lo que se escribió', () => {
    assert.equal(rearmarNotas(null, 'Me lo pasó Juan'), 'Me lo pasó Juan');
  });
});

describe('tieneDatos', () => {
  const vacio: DatosDelProspecto = {
    score: null,
    cargo: null,
    instagram: null,
    linkedin: null,
    mapsUrl: null,
    website: null,
  };

  it('un bloque sin ningún dato no se muestra', () => {
    assert.equal(tieneDatos(vacio), false);
    assert.equal(tieneDatos(null), false);
  });

  it('con un solo dato ya vale la pena mostrarlo', () => {
    assert.equal(tieneDatos({ ...vacio, mapsUrl: 'https://maps.google.com/x' }), true);
    assert.equal(tieneDatos({ ...vacio, score: 0 }), true);
  });
});

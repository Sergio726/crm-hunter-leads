// El rubro tiene que sobrevivir hasta la ficha del cliente.
//
// El usuario lo reportó así: "tengo mezclados inmobiliarias con gimnasios".
// Investigándolo apareció que el rubro NO se perdía al promover —
// `promote_prospects` copia `prospects.niche` a `clients.tags` — sino mucho
// antes: al normalizar lo que propone Turbo.
//
// `toFilters` hacía `niche: pack.id`, y `getNichePack` cae al primer pack
// ("generico") cuando no encuentra el id. Como los packs son de comercio local
// —solo tienen sentido en Google Maps—, TODO lo que salía de LinkedIn o
// Instagram se guardaba como "generico" y llegaba a Clientes sin rubro.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toFilters } from '../src/lib/prospect/agent';

describe('el rubro en toFilters', () => {
  it('en Google se resuelve contra un pack conocido', () => {
    // Acá el pack no es una etiqueta: de él salen los términos de búsqueda y los
    // nombres a excluir, así que tiene que ser un id real.
    const f = toFilters('google_places', {
      niche: 'inmobiliarias',
      areas: ['Córdoba'],
      limit: 10,
    });
    assert.equal(f.niche, 'inmobiliarias');
    assert.ok(f.queries.length > 0, 'el pack aporta sus términos');
  });

  it('en Google un rubro SIN pack conserva su nombre', () => {
    // Antes esto caía a "generico" y era el caso más frecuente, no una rareza:
    // medido sobre los datos reales, 41 clientes quedaron etiquetados con la
    // palabra "generico". Eran coaches de fitness buscados en Google, y **no
    // existe un pack de gimnasios**. Elegir "a medida" era lo correcto y aun así
    // el rubro se perdía.
    //
    // Guardar el texto es seguro: `getNichePack` sigue cayendo al pack genérico
    // cuando no reconoce el id, así que la búsqueda no cambia — lo único que
    // cambia es que la etiqueta dice algo.
    const f = toFilters('google_places', { niche: 'gimnasios', areas: ['X'] });
    assert.equal(f.niche, 'gimnasios');
  });

  it('un pack conocido se guarda por su id, no por lo que se escribió', () => {
    // El id es lo que después resuelve los términos y los nombres a excluir.
    const f = toFilters('google_places', { niche: 'inmobiliarias', areas: ['X'] });
    assert.equal(f.niche, 'inmobiliarias');
  });

  it('en LinkedIn el rubro se conserva tal cual', () => {
    // ESTE es el arreglo. Antes daba "generico" y el cliente nacía sin rubro.
    const f = toFilters('linkedin', {
      niche: 'dueños de pyme',
      areas: ['Buenos Aires'],
      jobTitles: ['fundador'],
    });
    assert.equal(f.niche, 'dueños de pyme');
  });

  it('en Instagram también', () => {
    const f = toFilters('instagram', { niche: 'gimnasios', areas: ['Rosario'] });
    assert.equal(f.niche, 'gimnasios');
  });

  it('sin rubro cae a generico en vez de quedar vacío', () => {
    // Un tag vacío sería peor que uno genérico: rompería el filtro de la
    // pantalla de Clientes, que agrupa por el texto del tag.
    assert.equal(toFilters('linkedin', { areas: ['X'] }).niche, 'generico');
    assert.equal(toFilters('linkedin', { niche: '   ', areas: ['X'] }).niche, 'generico');
  });

  it('el rubro no arrastra espacios que después ensucian el filtro', () => {
    // " gimnasios" y "gimnasios" se verían como dos rubros distintos en el
    // desplegable.
    assert.equal(toFilters('linkedin', { niche: '  gimnasios  ', areas: ['X'] }).niche, 'gimnasios');
  });
});

// Tests de la fuente LinkedIn: armado del input y puntaje de personas.
//
// El puntaje de una persona no puede compartir la fórmula de Google (no hay
// fotos ni reseñas), así que es lógica nueva y conviene fijarla.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildLinkedinInput,
  estimatePages,
  mapLinkedinProfiles,
  scoreProfile,
  type RawLinkedinProfile,
} from '../src/lib/prospect/linkedin';
import type { ProspectFilters } from '../src/lib/prospect/types';

const filtros = (extra: Partial<ProspectFilters> = {}): ProspectFilters => ({
  source: 'linkedin',
  queries: ['director comercial'],
  areas: ['Córdoba, Argentina'],
  country: 'AR',
  niche: 'generico',
  requireNoWebsite: false,
  requireInstagram: false,
  requireLinkedin: false,
  requireWhatsapp: false,
  minScore: 0,
  minRating: null,
  limit: 30,
  linkedin: { jobTitles: ['director comercial'], industries: [], seniority: [], companySizes: [] },
  ...extra,
});

describe('buildLinkedinInput', () => {
  it('manda cargos y ubicaciones como filtros estructurados', () => {
    const input = buildLinkedinInput(filtros());
    assert.deepEqual(input.currentJobTitles, ['director comercial']);
    assert.deepEqual(input.locations, ['Córdoba, Argentina']);
    assert.equal(input.profileScraperMode, 'Short');
  });

  it('NO inventa códigos numéricos de industria ni de seniority', () => {
    // Son ids internos de LinkedIn y no hay tabla de equivalencias. Mandar un
    // número adivinado filtraría por algo que nadie pidió, en silencio.
    const input = buildLinkedinInput(
      filtros({
        linkedin: {
          jobTitles: ['gerente'],
          industries: ['real estate'],
          seniority: ['director'],
          companySizes: [],
        },
      }),
    );
    assert.equal(input.industryIds, undefined);
    assert.equal(input.seniorityLevelIds, undefined);
    // Esas palabras viajan como texto de búsqueda, que sí es seguro.
    assert.equal(input.searchQuery, 'real estate director');
  });

  it('pide las páginas justas para el límite pedido', () => {
    assert.equal(estimatePages(filtros({ limit: 1 })), 1);
    assert.equal(estimatePages(filtros({ limit: 25 })), 1);
    assert.equal(estimatePages(filtros({ limit: 26 })), 2);
    assert.equal(estimatePages(filtros({ limit: 60 })), 3);
  });
});

describe('scoreProfile', () => {
  it('el cargo que coincide es la señal más fuerte', () => {
    const coincide = scoreProfile(
      { headline: 'Director Comercial en Acme', currentPosition: [{ companyName: 'Acme' }] },
      filtros(),
    );
    const noCoincide = scoreProfile(
      { headline: 'Fotógrafo de bodas', currentPosition: [{ companyName: 'Acme' }] },
      filtros(),
    );
    assert.ok(coincide.score > noCoincide.score);
    assert.ok(coincide.reasons.includes('El cargo coincide con lo buscado'));
  });

  it('estar en la zona buscada suma', () => {
    const enZona = scoreProfile(
      { headline: 'Director Comercial', location: { city: 'Córdoba' } },
      filtros(),
    );
    const fueraDeZona = scoreProfile(
      { headline: 'Director Comercial', location: { city: 'Lima' } },
      filtros(),
    );
    assert.ok(enZona.score > fueraDeZona.score);
  });

  it('alguien buscando trabajo resta, y se dice por qué', () => {
    const base = { headline: 'Director Comercial en Acme' };
    const buscando = scoreProfile({ ...base, openToWork: true }, filtros());
    const estable = scoreProfile(base, filtros());
    assert.ok(buscando.score < estable.score);
    assert.ok(buscando.reasons.includes('Está buscando trabajo'));
  });

  it('nunca se sale de 0 a 100', () => {
    const s = scoreProfile({ headline: '', openToWork: true }, filtros());
    assert.ok(s.score >= 0 && s.score <= 100);
  });
});

describe('mapLinkedinProfiles', () => {
  const perfiles: RawLinkedinProfile[] = [
    {
      publicIdentifier: 'juan-perez',
      firstName: 'Juan',
      lastName: 'Pérez',
      headline: 'Director Comercial en Acme',
      location: { city: 'Córdoba' },
      currentPosition: [{ companyName: 'Acme SA' }],
    },
    {
      publicIdentifier: 'JUAN-PEREZ',
      firstName: 'Juan',
      lastName: 'Pérez',
      headline: 'duplicado con otra capitalización',
    },
    { publicIdentifier: 'sin-nombre', headline: 'Director Comercial' },
  ];

  it('guarda el slug con el tipo, para poder rearmar la URL', () => {
    const [primero] = mapLinkedinProfiles(perfiles, filtros());
    assert.equal(primero.sourceRef, 'in/juan-perez');
    assert.equal(primero.linkedin, 'in/juan-perez');
    assert.equal(primero.kind, 'person');
    assert.equal(primero.source, 'linkedin');
  });

  it('deduplica sin importar la capitalización del slug', () => {
    const r = mapLinkedinProfiles(perfiles, filtros());
    assert.equal(r.filter((p) => p.sourceRef === 'in/juan-perez').length, 1);
  });

  it('descarta un perfil sin nombre en vez de guardarlo vacío', () => {
    const r = mapLinkedinProfiles(perfiles, filtros());
    assert.ok(!r.some((p) => p.businessName === ''));
  });

  it('lleva el titular y la empresa a las columnas de persona', () => {
    const [primero] = mapLinkedinProfiles(perfiles, filtros());
    assert.equal(primero.roleTitle, 'Director Comercial en Acme');
    assert.equal(primero.companyName, 'Acme SA');
  });

  it('respeta el score mínimo y el límite', () => {
    const exigente = mapLinkedinProfiles(perfiles, filtros({ minScore: 99 }));
    assert.equal(exigente.length, 0);
    const uno = mapLinkedinProfiles(perfiles, filtros({ limit: 1 }));
    assert.equal(uno.length, 1);
  });

  it('no marca "tiene web propia": es una señal de Google que acá no se midió', () => {
    const [primero] = mapLinkedinProfiles(perfiles, filtros());
    assert.equal(primero.hasOwnWebsite, false);
  });
});

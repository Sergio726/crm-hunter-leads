// Tests de la fuente LinkedIn.
//
// La forma de los ítems de acá NO sale de la documentación del actor: sale de
// una corrida real (2026-08-17). La doc prometía `publicIdentifier`, `headline`
// y `currentPosition`, y ninguno de los tres existe. La primera versión del
// mapeo se guio por la doc, usaba `publicIdentifier` como identidad y por eso
// **descartaba todos los perfiles**: la búsqueda devolvía exactamente 0 sin
// importar los filtros. Estos tests fijan la forma real para que no vuelva.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildLinkedinInput,
  cleanLocation,
  mainPosition,
  estimatePages,
  mapLinkedinProfiles,
  scoreProfile,
  slugFromUrl,
  tenureYears,
  type RawLinkedinProfile,
} from '../src/lib/prospect/linkedin';
import type { ProspectFilters } from '../src/lib/prospect/types';

const filtros = (extra: Partial<ProspectFilters> = {}): ProspectFilters => ({
  source: 'linkedin',
  queries: ['gerente comercial'],
  areas: ['Buenos Aires'],
  country: 'AR',
  niche: 'generico',
  requireNoWebsite: false,
  requireInstagram: false,
  requireLinkedin: false,
  requireWhatsapp: false,
  minRating: null,
  limit: 30,
  linkedin: { jobTitles: ['gerente comercial'], industries: [], seniority: [], companySizes: [] },
  ...extra,
});

/** Copia fiel de un ítem que devolvió el actor en modo "Short". */
const REAL: RawLinkedinProfile = {
  id: 'ACwAAAFPO7MBTwyWz9430PVElXqi8WK8C496tkw',
  linkedinUrl: 'https://www.linkedin.com/in/ACwAAAFPO7MBTwyWz9430PVElXqi8WK8C496tkw',
  firstName: 'Juan',
  lastName: 'Debenedetti',
  summary:
    'Más de 10 años de experiencia en gestión comercial en el Sector Agropecuario, con un enfoque en la generación de nuevas oportunidades y desarrollo de cuentas clave.',
  currentPositions: [
    {
      tenureAtPosition: { numYears: 4, numMonths: 7 },
      companyName: 'SYNAgro - Software Agropecuario ',
      title: 'Gerente Comercial, Zona Núcleo Bs As',
      current: true,
    },
  ],
  location: { linkedinText: 'Argentina' },
};

/**
 * Ítem tal como lo devuelve el modo "Full + email search" — forma DISTINTA a la
 * de Short. Es la que hizo que una corrida real trajera 23 perfiles sin cargo,
 * sin empresa y con puntaje 0: el mapeo solo entendía la forma de Short.
 */
const REAL_FULL: RawLinkedinProfile = {
  publicIdentifier: 'ana-gorodisch',
  linkedinUrl: 'https://www.linkedin.com/in/ana-gorodisch',
  firstName: 'Ana',
  lastName: 'Gorodisch',
  headline: 'CEO & Co-Founder en Kuvia',
  about:
    'Emprendedora serial. Construyo equipos que sostienen la operación sin que el fundador tenga que estar en cada decisión del día a día.',
  currentPosition: {
    title: 'CEO & Co-Founder',
    companyName: 'Kuvia',
    current: true,
    tenureAtPosition: { numYears: 3, numMonths: 2 },
  },
  emails: ['ana.gorodisch@kuvia.ai'],
  companyWebsites: ['https://kuvia.ai'],
  location: { linkedinText: 'Buenos Aires, Argentina' },
};

const filtrosCeo = () =>
  filtros({
    queries: ['CEO'],
    linkedin: { jobTitles: ['CEO'], industries: [], seniority: [], companySizes: [] },
  });

describe('las dos formas del actor', () => {
  it('mapea la forma de Full con cargo, empresa y email', () => {
    const [r] = mapLinkedinProfiles([REAL_FULL], filtrosCeo());
    assert.ok(r, 'no debería descartarse');
    assert.equal(r.businessName, 'Ana Gorodisch');
    assert.equal(r.roleTitle, 'CEO & Co-Founder');
    assert.equal(r.companyName, 'Kuvia');
    assert.equal(r.email, 'ana.gorodisch@kuvia.ai');
    assert.equal(r.website, 'https://kuvia.ai');
    assert.ok(r.score > 0, 'el puntaje no puede ser 0 en un perfil que coincide');
  });

  it('prefiere el slug legible de Full sobre el id interno de Short', () => {
    const [r] = mapLinkedinProfiles([REAL_FULL], filtros());
    assert.equal(r.sourceRef, 'in/ana-gorodisch');
  });

  it('lee el titular cuando el puesto no trae cargo', () => {
    const sinTitle = { ...REAL_FULL, currentPosition: { companyName: 'Kuvia', current: true } };
    const [r] = mapLinkedinProfiles([sinTitle], filtrosCeo());
    assert.ok(r.reasons.includes('El cargo coincide con lo buscado'));
  });

  it('anota que tiene email, porque cambia cómo se lo contacta', () => {
    const [r] = mapLinkedinProfiles([REAL_FULL], filtros());
    assert.ok(r.reasons.includes('Tiene email'));
  });

  it('la forma de Short sigue andando igual', () => {
    const [r] = mapLinkedinProfiles([REAL], filtros());
    assert.equal(r.companyName, 'SYNAgro - Software Agropecuario');
    assert.equal(r.email, null);
  });
});

describe('slugFromUrl', () => {
  it('saca la identidad de la URL, porque publicIdentifier no existe', () => {
    assert.equal(
      slugFromUrl('https://www.linkedin.com/in/ACwAAAFPO7MB'),
      'in/ACwAAAFPO7MB',
    );
  });
  it('conserva el tipo de perfil para poder rearmar la URL', () => {
    assert.equal(slugFromUrl('https://www.linkedin.com/company/acme/'), 'company/acme');
  });
  it('corta la basura del final', () => {
    assert.equal(slugFromUrl('https://ar.linkedin.com/in/juan-perez/about?trk=x'), 'in/juan-perez');
  });
  it('devuelve null con una URL que no es un perfil', () => {
    assert.equal(slugFromUrl('https://www.linkedin.com/feed/'), null);
    assert.equal(slugFromUrl(undefined), null);
  });
});

describe('mainPosition y tenureYears', () => {
  it('prefiere el puesto marcado como actual', () => {
    const p = mainPosition({
      currentPositions: [
        { title: 'Viejo', current: false },
        { title: 'Actual', current: true },
      ],
    });
    assert.equal(p?.title, 'Actual');
  });
  it('lee la antigüedad sumando los meses', () => {
    assert.equal(tenureYears({ tenureAtPosition: { numYears: 4, numMonths: 6 } }), 4.5);
  });
  it('sin antigüedad devuelve null, no cero', () => {
    assert.equal(tenureYears({ title: 'x' }), null);
    assert.equal(tenureYears(null), null);
  });
});

describe('cleanLocation', () => {
  // Medido con dos corridas reales idénticas salvo la zona:
  //   "Colombia (todo el país)" → 0 perfiles
  //   "Colombia"                → 3 perfiles
  // Es lo que dejaba la búsqueda del usuario en cero sin que ningún filtro
  // nuestro descartara nada.
  it('saca la aclaración entre paréntesis', () => {
    assert.equal(cleanLocation('Colombia (todo el país)'), 'Colombia');
    assert.equal(cleanLocation('Bogotá (Colombia)'), 'Bogotá');
  });
  it('se queda con un solo lugar cuando vienen varios en la misma línea', () => {
    assert.equal(cleanLocation('Bogotá - Medellín'), 'Bogotá');
    assert.equal(cleanLocation('Buenos Aires / CABA'), 'Buenos Aires');
  });
  it('no toca una zona que ya está bien', () => {
    assert.equal(cleanLocation('Colombia'), 'Colombia');
    // La coma separa ciudad y provincia: eso LinkedIn lo entiende.
    assert.equal(cleanLocation('Palermo, Buenos Aires'), 'Palermo, Buenos Aires');
  });
  it('si limpiar lo deja vacío, prefiere el original antes que nada', () => {
    assert.equal(cleanLocation('(todo el país)'), '(todo el país)');
  });
});

describe('buildLinkedinInput', () => {
  it('limpia las zonas antes de mandarlas y no repite', () => {
    const input = buildLinkedinInput(
      filtros({ areas: ['Colombia (todo el país)', 'Colombia', 'Bogotá - Medellín'] }),
    );
    assert.deepEqual(input.locations, ['Colombia', 'Bogotá']);
  });

  it('manda cargos y ubicaciones como filtros estructurados', () => {
    const input = buildLinkedinInput(filtros());
    assert.deepEqual(input.currentJobTitles, ['gerente comercial']);
    assert.deepEqual(input.locations, ['Buenos Aires']);
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
    assert.equal(input.searchQuery, 'real estate director');
  });

  it('pide las páginas justas para el límite pedido', () => {
    assert.equal(estimatePages(filtros({ limit: 25 })), 1);
    assert.equal(estimatePages(filtros({ limit: 26 })), 2);
  });
});

describe('scoreProfile', () => {
  it('el cargo que coincide es la señal más fuerte', () => {
    const coincide = scoreProfile(REAL, filtros());
    const otro = scoreProfile(
      { ...REAL, currentPositions: [{ title: 'Fotógrafo de bodas', companyName: 'X' }] },
      filtros(),
    );
    assert.ok(coincide.score > otro.score);
    assert.ok(coincide.reasons.includes('El cargo coincide con lo buscado'));
  });

  it('reconoce un cargo parecido, no solo el literal', () => {
    const parecido = scoreProfile(
      { ...REAL, currentPositions: [{ title: 'Gerente de Ventas', companyName: 'X' }] },
      filtros(),
    );
    assert.ok(parecido.reasons.includes('Cargo parecido al buscado'));
  });

  it('la antigüedad en el cargo suma, y se dice en años', () => {
    const veterano = scoreProfile(REAL, filtros());
    const nuevo = scoreProfile(
      {
        ...REAL,
        currentPositions: [{ ...REAL.currentPositions![0], tenureAtPosition: { numMonths: 2 } }],
      },
      filtros(),
    );
    assert.ok(veterano.score > nuevo.score);
    assert.ok(veterano.reasons.some((r) => r.includes('años en el cargo')));
  });

  it('la ubicación NO puntúa: el actor la da a nivel país y sería premiar ruido', () => {
    const enZona = scoreProfile(REAL, filtros({ areas: ['Buenos Aires'] }));
    const lejos = scoreProfile(REAL, filtros({ areas: ['Tokio'] }));
    assert.equal(enZona.score, lejos.score);
  });

  it('nunca se sale de 0 a 100', () => {
    const s = scoreProfile({}, filtros());
    assert.ok(s.score >= 0 && s.score <= 100);
  });
});

describe('mapLinkedinProfiles', () => {
  it('mapea un ítem REAL sin descartarlo — la regresión que devolvía 0', () => {
    const [r] = mapLinkedinProfiles([REAL], filtros());
    assert.ok(r, 'el perfil no debería descartarse');
    assert.equal(r.businessName, 'Juan Debenedetti');
    // Con la capitalización INTACTA: el id de LinkedIn distingue mayúsculas y
    // pasarlo a minúsculas dejaba una URL que no lleva a ese perfil.
    assert.equal(r.sourceRef, 'in/ACwAAAFPO7MBTwyWz9430PVElXqi8WK8C496tkw');
    assert.equal(r.kind, 'person');
    assert.equal(r.roleTitle, 'Gerente Comercial, Zona Núcleo Bs As');
    assert.equal(r.companyName, 'SYNAgro - Software Agropecuario');
    assert.ok(r.bio?.startsWith('Más de 10 años'));
  });

  it('deduplica sin importar la capitalización', () => {
    const otro = { ...REAL, linkedinUrl: REAL.linkedinUrl!.toUpperCase() };
    assert.equal(mapLinkedinProfiles([REAL, otro], filtros()).length, 1);
  });

  it('descarta un perfil sin nombre en vez de guardarlo vacío', () => {
    const sinNombre = { ...REAL, firstName: undefined, lastName: undefined };
    assert.equal(mapLinkedinProfiles([sinNombre], filtros()).length, 0);
  });

  it('cae al id cuando la URL no sirve', () => {
    const [r] = mapLinkedinProfiles([{ ...REAL, linkedinUrl: undefined }], filtros());
    assert.equal(r.sourceRef, `in/${REAL.id}`);
  });

  it('NO filtra por puntaje: el puntaje ordena', () => {
    // Un perfil que no coincide en nada igual tiene que aparecer, abajo de todo.
    const flojo: RawLinkedinProfile = {
      linkedinUrl: 'https://www.linkedin.com/in/zzz',
      firstName: 'Ana',
      lastName: 'Gómez',
    };
    const r = mapLinkedinProfiles([flojo, REAL], filtros());
    assert.equal(r.length, 2);
    assert.equal(r[0].businessName, 'Juan Debenedetti', 'el mejor va primero');
  });

  it('respeta el límite', () => {
    const otro = { ...REAL, linkedinUrl: 'https://www.linkedin.com/in/otro', firstName: 'Ana' };
    assert.equal(mapLinkedinProfiles([REAL, otro], filtros({ limit: 1 })).length, 1);
  });

  it('no marca "tiene web propia": es una señal de Google que acá no se midió', () => {
    const [r] = mapLinkedinProfiles([REAL], filtros());
    assert.equal(r.hasOwnWebsite, false);
  });
});

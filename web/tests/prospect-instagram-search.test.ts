// Tests del descubrimiento por Instagram.
//
// Lo que de verdad importa acá: el actor devuelve UNA FILA POR PUBLICACIÓN con
// los datos del dueño repetidos. Sin agrupar, la misma cuenta entraría seis
// veces como seis prospectos distintos.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  aggregateByAccount,
  buildIgSearchInput,
  estimateIgUnits,
  mapIgSearchResults,
  scoreAccount,
  type RawIgSearchItem,
} from '../src/lib/prospect/instagram-search';
import type { ProspectFilters } from '../src/lib/prospect/types';

const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();

const filtros = (extra: Partial<ProspectFilters> = {}): ProspectFilters => ({
  source: 'instagram',
  queries: ['inmobiliaria'],
  areas: ['Córdoba, Argentina'],
  country: 'AR',
  niche: 'inmobiliarias',
  requireNoWebsite: false,
  requireInstagram: false,
  requireLinkedin: false,
  requireWhatsapp: false,
  minScore: 0,
  minRating: null,
  limit: 30,
  ...extra,
});

describe('buildIgSearchInput', () => {
  it('mete la zona en el término, porque Instagram no filtra por geografía', () => {
    const input = buildIgSearchInput(filtros());
    assert.equal(input.search, 'inmobiliaria Córdoba');
    assert.equal(input.searchType, 'profile');
  });

  it('el techo de resultados cuenta las publicaciones por cuenta', () => {
    // Se factura por ítem devuelto, y cada cuenta trae varias publicaciones:
    // estimar por cuenta subestimaría el costo seis veces.
    assert.equal(estimateIgUnits(filtros({ limit: 10 })), 60);
  });
});

describe('aggregateByAccount', () => {
  const items: RawIgSearchItem[] = [
    { ownerUsername: 'acme', followersCount: 5000, timestamp: hace(40), likesCount: 10 },
    { ownerUsername: 'acme', timestamp: hace(3), likesCount: 20, biography: 'Vendemos casas' },
    { ownerUsername: 'ACME', timestamp: hace(90), likesCount: 5 },
    { ownerUsername: 'otra', followersCount: 100, timestamp: hace(500) },
    { timestamp: hace(1) },
  ];

  it('junta todas las publicaciones de una cuenta en una sola fila', () => {
    const r = aggregateByAccount(items);
    assert.equal(r.length, 2);
    assert.equal(r.find((a) => a.username === 'acme')?.posts, 3);
  });

  it('se queda con la publicación MÁS RECIENTE, no con la última que llegó', () => {
    const acme = aggregateByAccount(items).find((a) => a.username === 'acme');
    const dias = (Date.now() - new Date(acme!.lastPostAt!).getTime()) / 86_400_000;
    assert.ok(dias < 5, `esperaba la de hace 3 días, dio una de hace ${Math.round(dias)}`);
  });

  it('completa los datos de la cuenta aunque vengan en filas distintas', () => {
    const acme = aggregateByAccount(items).find((a) => a.username === 'acme');
    assert.equal(acme?.followers, 5000);
    assert.equal(acme?.biography, 'Vendemos casas');
  });

  it('descarta las filas sin dueño en vez de crear una cuenta fantasma', () => {
    assert.ok(!aggregateByAccount(items).some((a) => !a.username));
  });
});

describe('scoreAccount', () => {
  const base = {
    username: 'x',
    fullName: null,
    biography: 'algo',
    verified: false,
    posts: 3,
    engagement: 30,
  };

  it('una cuenta viva vale más que una dormida con la misma audiencia', () => {
    const viva = scoreAccount({ ...base, followers: 5000, lastPostAt: hace(5) });
    const dormida = scoreAccount({ ...base, followers: 5000, lastPostAt: hace(400) });
    assert.ok(viva.score > dormida.score);
    assert.ok(viva.reasons.includes('Publica seguido'));
    assert.ok(dormida.reasons.includes('Hace mucho que no publica'));
  });

  it('sin fecha de publicación cuenta como dormida, no como desconocida', () => {
    const s = scoreAccount({ ...base, followers: 5000, lastPostAt: null });
    assert.ok(s.reasons.includes('Hace mucho que no publica'));
  });

  it('nunca se sale de 0 a 100', () => {
    const s = scoreAccount({
      ...base,
      followers: 999_999,
      lastPostAt: hace(1),
      verified: true,
      engagement: 999_999,
    });
    assert.ok(s.score >= 0 && s.score <= 100);
  });
});

describe('mapIgSearchResults', () => {
  const items: RawIgSearchItem[] = [
    {
      ownerUsername: 'acme',
      ownerFullName: 'Acme Propiedades',
      followersCount: 8000,
      biography: 'Casas en Córdoba',
      timestamp: hace(2),
      likesCount: 300,
    },
    { ownerUsername: 'acme', timestamp: hace(10), likesCount: 250 },
  ];

  it('devuelve una cuenta, no una fila por publicación', () => {
    const r = mapIgSearchResults(items, filtros());
    assert.equal(r.length, 1);
    assert.equal(r[0].sourceRef, 'acme');
    assert.equal(r[0].kind, 'account');
    assert.equal(r[0].businessName, 'Acme Propiedades');
  });

  it('usa el arroba cuando la cuenta no tiene nombre', () => {
    const r = mapIgSearchResults([{ ownerUsername: 'solohandle', timestamp: hace(1) }], filtros());
    assert.equal(r[0].businessName, '@solohandle');
  });

  it('respeta el score mínimo', () => {
    assert.equal(mapIgSearchResults(items, filtros({ minScore: 99 })).length, 0);
  });
});

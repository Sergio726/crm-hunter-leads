// Registro de fuentes ejecutables — SOLO servidor.
//
// Cada fuente declara lo mismo: qué credencial necesita, cuánto va a costar la
// corrida antes de hacerla, y cómo se ejecuta. Todas devuelven la misma forma de
// resultado, así que la ruta de búsqueda, el Plan de Caza y la tabla no saben ni
// necesitan saber contra qué proveedor están hablando.
//
// Antes esto no existía: la ruta importaba Google Places directamente y toda la
// cañería asumía un place_id. Agregar LinkedIn habría significado un `if` en
// cada capa.

import 'server-only';
import { estimateIgUnits } from '../instagram-search';
import { PROFILES_PER_PAGE, estimatePages } from '../linkedin';
import { MAX_REQUESTS_PER_RUN, runProspectSearch, type SearchRun } from '../places';
import { SOURCES, estimate, type Estimate, type SourceId } from './catalog';
import type { ProspectFilters } from '../types';

/** Nombre del secreto en `private.integration_secrets`. */
type SecretKey = 'openrouter_api_key' | 'google_places_api_key' | 'apify_api_token';

export interface SourceRunner {
  id: SourceId;
  /**
   * `sync` termina dentro de la misma petición (Google Maps: ~40 s).
   * `async` tarda minutos y va por `/api/prospect/runs`, porque el plan Hobby
   * de Vercel corta a los 60 s.
   */
  mode: 'sync' | 'async';
  /** Qué credencial hace falta para correrla. */
  secretKey: SecretKey;
  /** Qué decirle al usuario si esa credencial no está cargada. */
  missingSecretMessage: string;
  /**
   * Cuántas unidades facturadas va a consumir, como techo.
   * Es lo que el Plan de Caza le promete al usuario antes de gastar.
   */
  estimateUnits(filters: ProspectFilters): number;
  /** Solo las fuentes `sync` la implementan. */
  run?(filters: ProspectFilters, secret: string): Promise<SearchRun>;
}

const googlePlaces: SourceRunner = {
  id: 'google_places',
  mode: 'sync',
  secretKey: 'google_places_api_key',
  missingSecretMessage:
    'Falta la API key de Google Places. Cargala en Configuración → Prospección ' +
    '(o como GOOGLE_PLACES_API_KEY en el entorno).',

  estimateUnits(filters) {
    // Cada combinación de zona × término puede pedir hasta 3 páginas (Places
    // devuelve como máximo 60 resultados por búsqueda, de a 20). El tope duro de
    // la corrida manda por encima de todo.
    const combos = Math.max(1, filters.areas.length) * Math.max(1, filters.queries.length);
    return Math.min(MAX_REQUESTS_PER_RUN, combos * 3);
  },

  run(filters, secret) {
    return runProspectSearch(filters, secret);
  },
};

const linkedin: SourceRunner = {
  id: 'linkedin',
  // Una búsqueda de varias páginas tarda minutos: no entra en una petición.
  mode: 'async',
  secretKey: 'apify_api_token',
  missingSecretMessage:
    'Falta el token de Apify. Cargalo en Configuración → Prospección ' +
    '(o como APIFY_API_TOKEN en el entorno).',

  estimateUnits(filters) {
    // Se factura por página de 25 perfiles, pero el catálogo cotiza por perfil,
    // así que se devuelven las páginas completas que se van a pagar.
    return estimatePages(filters) * PROFILES_PER_PAGE;
  },
};

const instagram: SourceRunner = {
  id: 'instagram',
  mode: 'async',
  secretKey: 'apify_api_token',
  missingSecretMessage: linkedin.missingSecretMessage,
  estimateUnits: estimateIgUnits,
};

const RUNNERS: Partial<Record<SourceId, SourceRunner>> = {
  google_places: googlePlaces,
  linkedin,
  instagram,
  // TikTok queda fuera a propósito: es el mercado más chico para venta B2B y
  // sumarlo agrega una integración que hoy nadie pidió. El catálogo lo describe
  // para que la decisión esté a la vista, pero `getRunner` devuelve null y la
  // ruta lo dice con todas las letras en vez de fallar de forma rara.
};

export function getRunner(id: SourceId): SourceRunner | null {
  return RUNNERS[id] ?? null;
}

/** Las fuentes que hoy se pueden ejecutar de verdad. */
export function availableSources(): SourceId[] {
  return Object.keys(RUNNERS) as SourceId[];
}

/** Estimación de costo y tiempo de una corrida, para mostrarla antes de gastar. */
export function estimateRun(id: SourceId, filters: ProspectFilters): Estimate {
  const runner = getRunner(id);
  const units = runner ? runner.estimateUnits(filters) : filters.limit;
  return estimate(id, units);
}

export { SOURCES };

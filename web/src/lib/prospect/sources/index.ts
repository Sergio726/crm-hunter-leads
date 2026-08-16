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
import { MAX_REQUESTS_PER_RUN, runProspectSearch, type SearchRun } from '../places';
import { SOURCES, estimate, type Estimate, type SourceId } from './catalog';
import type { ProspectFilters } from '../types';

/** Nombre del secreto en `private.integration_secrets`. */
type SecretKey = 'openrouter_api_key' | 'google_places_api_key' | 'apify_api_token';

export interface SourceRunner {
  id: SourceId;
  /** Qué credencial hace falta para correrla. */
  secretKey: SecretKey;
  /** Qué decirle al usuario si esa credencial no está cargada. */
  missingSecretMessage: string;
  /**
   * Cuántas unidades facturadas va a consumir, como techo.
   * Es lo que el Plan de Caza le promete al usuario antes de gastar.
   */
  estimateUnits(filters: ProspectFilters): number;
  run(filters: ProspectFilters, secret: string): Promise<SearchRun>;
}

const googlePlaces: SourceRunner = {
  id: 'google_places',
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

const RUNNERS: Partial<Record<SourceId, SourceRunner>> = {
  google_places: googlePlaces,
  // linkedin / instagram / tiktok entran en las fases 6 y 7. Que falten acá no
  // es un olvido: el catálogo las lista para que Turbo las conozca, pero
  // `getRunner` devuelve null y la ruta responde que todavía no está disponible.
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

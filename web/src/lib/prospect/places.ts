// Cliente de Google Places API (New) — SOLO servidor.
//
// Se usa la API nueva (places.googleapis.com/v1) porque las keys creadas hoy en
// Google Cloud ya no habilitan la legacy. La key va en GOOGLE_PLACES_API_KEY y
// nunca se expone al browser: este módulo solo se importa desde route handlers.
//
// Costo: cada request de Text Search se factura, y el field mask define el SKU.
// Por eso hay un tope duro de requests por corrida (MAX_REQUESTS_PER_RUN) y el
// resultado informa cuántas se hicieron, para que no haya sorpresas.

import 'server-only';
import { getNichePack, notOwnWebsiteDomains, type NichePack } from './niches';
import { scoreProspect } from './scoring';
import { COUNTRIES, type CountryCode, type ProspectFilters, type ProspectResult } from './types';

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';

/** Campos pedidos por resultado — es lo único que se factura. */
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.websiteUri',
  'places.nationalPhoneNumber',
  'places.internationalPhoneNumber',
  'places.rating',
  'places.userRatingCount',
  'places.photos',
  'places.reviews',
  'places.googleMapsUri',
  'nextPageToken',
].join(',');

/** Tope de llamadas facturadas por corrida. Una corrida grande se hace en varias. */
const MAX_REQUESTS_PER_RUN = 24;
const PAGE_SIZE = 20;

interface PlaceReview {
  relativePublishTimeDescription?: string;
}

interface RawPlace {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  rating?: number;
  userRatingCount?: number;
  photos?: unknown[];
  reviews?: PlaceReview[];
  googleMapsUri?: string;
}

const IG_HANDLE_RE = /(?:instagram\.com|instagr\.am)\/([A-Za-z0-9._]{2,30})/i;

/** Segmentos de instagram.com que nunca son un perfil de negocio. */
const IG_BLOCKED = new Set([
  'p',
  'reel',
  'reels',
  'stories',
  'explore',
  'accounts',
  'about',
  'legal',
  'directory',
  'share',
  'tv',
  'tags',
  'www',
]);

/**
 * LinkedIn de empresa (`/company/…`) o de persona (`/in/…`). Se acepta el
 * subdominio de país (ar.linkedin.com, es.linkedin.com…), que es habitual.
 */
const LI_SLUG_RE = /linkedin\.com\/(company|in|school)\/([A-Za-z0-9\-_%.]{2,100})/i;

/**
 * Devuelve `company/acme`, `in/juan-perez` o `school/…`: el tipo va incluido.
 *
 * Guardar solo el slug haría imposible reconstruir la URL — `company/acme` e
 * `in/acme` son perfiles distintos y no hay forma de adivinar cuál era. Con el
 * tipo adelante alcanza con anteponer el dominio (ver `linkedinUrl`).
 */
export function extractLinkedin(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = LI_SLUG_RE.exec(url);
  if (!match) return null;
  const type = match[1].toLowerCase();
  // Se corta en el primer separador: los links suelen traer /about, ?trk=… o /
  const slug = match[2].toLowerCase().split(/[/?#]/)[0].replace(/\.$/, '');
  return slug.length >= 2 ? `${type}/${slug}` : null;
}

export function extractInstagram(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = IG_HANDLE_RE.exec(url);
  if (!match) return null;
  const handle = match[1].toLowerCase().replace(/\.$/, '');
  if (IG_BLOCKED.has(handle) || handle.length < 2) return null;
  return handle;
}

/** ¿El website de la ficha es un dominio propio, o una red/portal del rubro? */
export function hasOwnWebsite(url: string | null | undefined, pack: NichePack): boolean {
  const value = (url ?? '').toLowerCase();
  if (!value) return false;
  return !notOwnWebsiteDomains(pack).some((domain) => value.includes(domain));
}

/**
 * Heurística de WhatsApp: ¿el teléfono publicado parece un celular?
 *
 * Google a veces omite el 9 del móvil argentino (+5411… en vez de +54911…), así
 * que para AR se acepta también un número con largo de móvil y código de área
 * conocido — de lo contrario se perderían prospectos válidos.
 *
 * En países donde móvil y fijo comparten formato (México), no hay forma de
 * distinguirlos por el número: se devuelve `true` para no filtrar a ciegas, y la
 * UI avisa que ahí la señal no discrimina.
 */
export function looksLikeMobile(
  internationalPhone: string | null | undefined,
  nationalPhone: string | null | undefined,
  country: CountryCode,
): boolean {
  const intl = (internationalPhone ?? '').replace(/[\s-]/g, '');
  const nat = (nationalPhone ?? '').replace(/[\s-]/g, '');
  if (!intl && !nat) return false;

  const pattern = COUNTRIES[country].mobilePattern;
  if (pattern === null) return true; // no discriminable en este país

  if (pattern.test(intl)) return true;

  if (country === 'AR') {
    if (intl.startsWith('+54')) {
      const rest = intl.slice(3);
      const knownAreaCodes = ['11', '15', '221', '223', '261', '299', '341', '351', '381', '387'];
      if (rest.length >= 10 && knownAreaCodes.some((code) => rest.startsWith(code))) return true;
    }
    return nat.startsWith('15');
  }

  return false;
}

async function searchText(
  textQuery: string,
  country: CountryCode,
  budget: { remaining: number },
  apiKey: string,
): Promise<RawPlace[]> {
  const results: RawPlace[] = [];
  let pageToken: string | undefined;

  while (budget.remaining > 0) {
    budget.remaining -= 1;
    const body: Record<string, unknown> = {
      textQuery,
      languageCode: 'es',
      regionCode: COUNTRIES[country].region,
      pageSize: PAGE_SIZE,
    };
    if (pageToken) body.pageToken = pageToken;

    const res = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Places respondió ${res.status}. ${detail.slice(0, 200)}`);
    }

    const data = (await res.json()) as { places?: RawPlace[]; nextPageToken?: string };
    results.push(...(data.places ?? []));

    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
    // El token tarda un instante en activarse del lado de Google.
    await new Promise((resolve) => setTimeout(resolve, 1200));
  }

  return results;
}

function nameIsExcluded(name: string, pack: NichePack): boolean {
  const lower = name.toLowerCase();
  return pack.excludeNames.some((bad) => lower.includes(bad));
}

export interface SearchRun {
  results: ProspectResult[];
  /** Cuántos candidatos pasaron los filtros antes de recortar a `limit`. */
  totalMatched: number;
  requestsUsed: number;
  /** Motivos de descarte, para explicar un embudo vacío en vez de mostrar cero sin más. */
  discarded: DiscardReasons;
  truncated: boolean;
}

export interface DiscardReasons {
  withWebsite: number;
  noInstagram: number;
  noLinkedin: number;
  noWhatsapp: number;
  lowRating: number;
  lowScore: number;
  excludedName: number;
}

/**
 * Ejecuta la búsqueda completa: recorre zonas × queries, deduplica, filtra,
 * puntúa y devuelve los mejores.
 *
 * Importante: se junta TODO el pool y recién al final se ordena por score y se
 * recorta a `limit`. Cortar antes de ordenar devolvería "los primeros N que
 * pasaron el filtro", no los N mejores.
 *
 * Lo que sí se corta antes es la RECOLECCIÓN, y por tamaño de pool, no por
 * `limit`: ver POOL_FACTOR. El ranking necesita competencia, pero no necesita
 * competencia infinita.
 */
export async function runProspectSearch(
  filters: ProspectFilters,
  apiKey: string,
): Promise<SearchRun> {
  const pack = getNichePack(filters.niche);
  const queries = filters.queries.length > 0 ? filters.queries : pack.queries;
  if (queries.length === 0) {
    throw new Error('La búsqueda necesita al menos un término (ej. "inmobiliaria").');
  }
  if (filters.areas.length === 0) {
    throw new Error('La búsqueda necesita al menos una zona (ej. "Palermo, Buenos Aires").');
  }

  const budget = { remaining: MAX_REQUESTS_PER_RUN };
  // Cuántos candidatos juntar antes de dejar de gastar requests facturados.
  // Se corta por pool y NO por `filters.limit` a propósito: con limit=2, cortar
  // en 2 devolvería los dos primeros que pasaron el filtro en vez de los dos
  // mejores. Con 5× el límite pedido y un piso de 40 hay competencia de sobra
  // para ordenar, y "buscame 2" deja de costar una corrida entera.
  // Para el límite por defecto (30) el objetivo queda en 150, que en la
  // práctica no se alcanza: las búsquedas normales no cambian de comportamiento.
  const poolTarget = Math.max(filters.limit * 5, 40);
  const seen = new Set<string>();
  const matched: ProspectResult[] = [];
  const discarded: DiscardReasons = {
    withWebsite: 0,
    noInstagram: 0,
    noLinkedin: 0,
    noWhatsapp: 0,
    lowRating: 0,
    lowScore: 0,
    excludedName: 0,
  };

  // El corte por pool va en el borde de zona/query, nunca a mitad de una página
  // ya paga: la request se hizo, procesarla entera es gratis.
  for (const area of filters.areas) {
    if (budget.remaining <= 0 || matched.length >= poolTarget) break;
    for (const query of queries) {
      if (budget.remaining <= 0 || matched.length >= poolTarget) break;
      const text = `${query} en ${area}, ${COUNTRIES[filters.country].name}`;
      const batch = await searchText(text, filters.country, budget, apiKey);

      for (const place of batch) {
        const placeId = place.id;
        const name = place.displayName?.text;
        if (!placeId || !name || seen.has(placeId)) continue;
        seen.add(placeId);

        if (nameIsExcluded(name, pack)) {
          discarded.excludedName += 1;
          continue;
        }

        const ownWebsite = hasOwnWebsite(place.websiteUri, pack);
        if (filters.requireNoWebsite && ownWebsite) {
          discarded.withWebsite += 1;
          continue;
        }

        const instagram = extractInstagram(place.websiteUri);
        if (filters.requireInstagram && !instagram) {
          discarded.noInstagram += 1;
          continue;
        }

        const linkedin = extractLinkedin(place.websiteUri);
        if (filters.requireLinkedin && !linkedin) {
          discarded.noLinkedin += 1;
          continue;
        }

        const isMobile = looksLikeMobile(
          place.internationalPhoneNumber,
          place.nationalPhoneNumber,
          filters.country,
        );
        if (filters.requireWhatsapp && !isMobile) {
          discarded.noWhatsapp += 1;
          continue;
        }

        const rating = place.rating ?? null;
        // Sin rating tampoco alcanza el piso: un negocio sin reseñas no puede
        // demostrar la calificación que se está exigiendo. Antes se colaba.
        if (filters.minRating !== null && (rating === null || rating < filters.minRating)) {
          discarded.lowRating += 1;
          continue;
        }

        const { score, reasons } = scoreProspect(
          {
            photosCount: place.photos?.length ?? 0,
            reviewsCount: place.userRatingCount ?? 0,
            rating,
            instagram,
            reviewAges: (place.reviews ?? [])
              .map((r) => r.relativePublishTimeDescription ?? '')
              .filter(Boolean),
          },
          pack,
        );

        if (score < filters.minScore) {
          discarded.lowScore += 1;
          continue;
        }

        matched.push({
          googlePlaceId: placeId,
          businessName: name,
          address: place.formattedAddress ?? null,
          area,
          phone: place.nationalPhoneNumber ?? null,
          whatsappPhone: isMobile ? (place.internationalPhoneNumber ?? null) : null,
          website: place.websiteUri ?? null,
          instagram,
          linkedin,
          mapsUrl: place.googleMapsUri ?? null,
          rating,
          reviewsCount: place.userRatingCount ?? 0,
          photosCount: place.photos?.length ?? 0,
          hasOwnWebsite: ownWebsite,
          score,
          reasons,
        });
      }
    }
  }

  matched.sort((a, b) => b.score - a.score);

  return {
    results: matched.slice(0, filters.limit),
    totalMatched: matched.length,
    requestsUsed: MAX_REQUESTS_PER_RUN - budget.remaining,
    discarded,
    truncated: budget.remaining <= 0,
  };
}

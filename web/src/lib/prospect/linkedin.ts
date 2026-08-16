// Búsqueda de personas en LinkedIn vía Apify — SOLO servidor.
//
// Actor: `harvestapi/linkedin-profile-search`. Se eligió **por no pedir
// cookies**: hay actores más baratos que usan la sesión de LinkedIn del propio
// usuario, y eso puede terminar en su cuenta personal restringida. Acá el
// usuario no expone nada suyo.
//
// Modo "Short": US$ 0,10 por página de 25 perfiles. Devuelve nombre, titular,
// ubicación y URL del perfil — suficiente para una lista de leads. El modo
// "Full" agrega el historial laboral completo a US$ 0,004 por perfil; no se usa
// todavía porque para decidir a quién llamar alcanza con el titular.
//
// Corre siempre de forma ASÍNCRONA: una búsqueda de varias páginas tarda
// minutos y el plan Hobby de Vercel corta a los 60 segundos.

import 'server-only';
import type { ProspectFilters, ProspectResult } from './types';

export const LINKEDIN_ACTOR = 'harvestapi~linkedin-profile-search';

/** Perfiles por página que devuelve el actor. Define el costo: US$ 0,10 la página. */
export const PROFILES_PER_PAGE = 25;

/** Campos que se piden del dataset, para no traer el perfil entero. */
export const LINKEDIN_FIELDS = [
  'id',
  'publicIdentifier',
  'linkedinUrl',
  'firstName',
  'lastName',
  'headline',
  'location',
  'currentPosition',
  'verified',
  'openToWork',
].join(',');

export interface RawLinkedinProfile {
  id?: string;
  publicIdentifier?: string;
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  headline?: string;
  location?: { countryCode?: string; city?: string; state?: string; linkedinText?: string };
  currentPosition?: { companyName?: string; title?: string }[];
  verified?: boolean;
  openToWork?: boolean;
}

/**
 * Arma el input del actor a partir de los filtros.
 *
 * Decisión deliberada: `industryIds`, `seniorityLevelIds` y `functionIds` se
 * pasan por alto aunque el actor los acepte. Son **códigos numéricos internos de
 * LinkedIn** y no hay forma de traducir "inmobiliaria" a un id sin una tabla de
 * equivalencias que no tenemos. Mandar un número inventado filtraría la búsqueda
 * por algo que nadie pidió, en silencio, y eso es peor que no filtrar: esas
 * palabras van al `searchQuery`, donde LinkedIn las usa como texto.
 */
export function buildLinkedinInput(filters: ProspectFilters): Record<string, unknown> {
  const li = filters.linkedin;
  const titles = li?.jobTitles?.length ? li.jobTitles : filters.queries;

  // Todo lo que no se puede mapear a un filtro estructurado va como texto.
  const queryParts = [...(li?.industries ?? []), ...(li?.seniority ?? [])].filter(Boolean);

  const pages = Math.max(1, Math.ceil(filters.limit / PROFILES_PER_PAGE));

  return {
    profileScraperMode: 'Short',
    ...(titles.length > 0 ? { currentJobTitles: titles } : {}),
    ...(filters.areas.length > 0 ? { locations: filters.areas } : {}),
    ...(queryParts.length > 0 ? { searchQuery: queryParts.join(' ') } : {}),
    maxItems: filters.limit,
    startPage: 1,
    takePages: pages,
  };
}

/** Cuántas páginas facturadas va a consumir. Es lo que se le promete al usuario. */
export function estimatePages(filters: ProspectFilters): number {
  return Math.max(1, Math.ceil(filters.limit / PROFILES_PER_PAGE));
}

/**
 * Puntaje de una persona.
 *
 * No puede compartir la fórmula de Google: acá no hay fotos, ni reseñas, ni
 * rating. Se mide qué tan cerca está del avatar que se pidió. Los motivos se
 * devuelven en castellano porque son lo que el vendedor ve en la tabla.
 */
export function scoreProfile(
  profile: RawLinkedinProfile,
  filters: ProspectFilters,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const headline = (profile.headline ?? '').toLowerCase();
  const wanted = (filters.linkedin?.jobTitles?.length ? filters.linkedin.jobTitles : filters.queries)
    .map((t) => t.toLowerCase())
    .filter(Boolean);

  // El cargo es la señal más fuerte: es literalmente lo que se pidió.
  const titleHit = wanted.some((t) => headline.includes(t));
  if (titleHit) {
    score += 45;
    reasons.push('El cargo coincide con lo buscado');
  } else if (headline) {
    score += 15;
    reasons.push('Cargo relacionado');
  }

  const company = profile.currentPosition?.[0]?.companyName;
  if (company) {
    score += 20;
    reasons.push('Empresa actual identificada');
  } else {
    reasons.push('Sin empresa actual visible');
  }

  // Una ubicación que coincide importa cuando el vendedor acotó zona.
  const locationText = [profile.location?.city, profile.location?.state, profile.location?.linkedinText]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const areaHit = filters.areas.some((a) => locationText.includes(a.split(',')[0].trim().toLowerCase()));
  if (areaHit) {
    score += 15;
    reasons.push('Está en la zona buscada');
  }

  if (profile.verified) {
    score += 10;
    reasons.push('Perfil verificado');
  }
  if (profile.openToWork) {
    // Señal ambigua a propósito: para vender servicios a la empresa, alguien que
    // se está por ir es peor contacto. Resta poco, pero se dice.
    score -= 10;
    reasons.push('Está buscando trabajo');
  }
  if (headline.length > 40) score += 10;

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

/** Traduce lo que devolvió el actor al formato común de resultado. */
export function mapLinkedinProfiles(
  items: RawLinkedinProfile[],
  filters: ProspectFilters,
): ProspectResult[] {
  const seen = new Set<string>();
  const results: ProspectResult[] = [];

  for (const profile of items ?? []) {
    // `publicIdentifier` es el slug del perfil; con él se rearma la URL y sirve
    // como identidad estable dentro de la fuente.
    const slug = profile.publicIdentifier?.trim().toLowerCase();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
    if (!name) continue;

    const { score, reasons } = scoreProfile(profile, filters);
    if (score < filters.minScore) continue;

    const area =
      profile.location?.city ??
      profile.location?.state ??
      profile.location?.linkedinText ??
      filters.areas[0] ??
      '';

    results.push({
      source: 'linkedin',
      sourceRef: `in/${slug}`,
      kind: 'person',
      businessName: name,
      address: profile.location?.linkedinText ?? null,
      area,
      phone: null,
      whatsappPhone: null,
      website: null,
      instagram: null,
      linkedin: `in/${slug}`,
      mapsUrl: null,
      rating: null,
      reviewsCount: 0,
      photosCount: 0,
      // Una persona no tiene "web propia"; el campo existe por Google y acá no
      // aplica. En false para no inventar una señal que no se midió.
      hasOwnWebsite: false,
      score,
      reasons,
      roleTitle: profile.headline ?? null,
      companyName: profile.currentPosition?.[0]?.companyName ?? null,
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, filters.limit);
}

// Búsqueda de personas en LinkedIn vía Apify — SOLO servidor.
//
// Actor: `harvestapi/linkedin-profile-search`. Se eligió **por no pedir
// cookies**: hay actores más baratos que usan la sesión de LinkedIn del propio
// usuario, y eso puede terminar en su cuenta personal restringida. Acá el
// usuario no expone nada suyo.
//
// Modo "Short": US$ 0,10 por página de 25 perfiles.
//
// ⚠️ LA DOCUMENTACIÓN DEL ACTOR NO COINCIDE CON LO QUE DEVUELVE.
// Verificado con una corrida real (2026-08-17). El modo `Short` devuelve:
//
//   id, linkedinUrl, firstName, lastName, summary, openProfile,
//   premium, currentPositions[], location{linkedinText}, profileIdInSearch
//
// La doc prometía `publicIdentifier`, `headline` y `currentPosition` (singular).
// Ninguno existe. La primera versión de este archivo usaba `publicIdentifier`
// como identidad, así que descartaba TODOS los perfiles y la búsqueda devolvía
// exactamente 0 — sin importar los filtros. Los nombres de acá salen de mirar
// un ítem real, no de la documentación.
//
// Corre siempre de forma ASÍNCRONA: una búsqueda de varias páginas tarda
// minutos y el plan Hobby de Vercel corta a los 60 segundos.

import 'server-only';
import type { ProspectFilters, ProspectResult } from './types';

export const LINKEDIN_ACTOR = 'harvestapi~linkedin-profile-search';

/** Perfiles por página que devuelve el actor. Define el costo: US$ 0,10 la página. */
export const PROFILES_PER_PAGE = 25;

/** Campos del dataset, con los nombres REALES. */
export const LINKEDIN_FIELDS = [
  'id',
  'linkedinUrl',
  'firstName',
  'lastName',
  'summary',
  'currentPositions',
  'location',
  'openProfile',
  'premium',
].join(',');

export interface LinkedinPosition {
  title?: string;
  companyName?: string;
  description?: string;
  current?: boolean;
  tenureAtPosition?: { numYears?: number; numMonths?: number };
}

export interface RawLinkedinProfile {
  id?: string;
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  /** El "Acerca de" del perfil, no el titular. Sirve para el mensaje asistido. */
  summary?: string;
  currentPositions?: LinkedinPosition[];
  location?: { linkedinText?: string; city?: string; countryCode?: string };
  openProfile?: boolean;
  premium?: boolean;
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

  return {
    profileScraperMode: 'Short',
    ...(titles.length > 0 ? { currentJobTitles: titles } : {}),
    ...(filters.areas.length > 0 ? { locations: filters.areas } : {}),
    ...(queryParts.length > 0 ? { searchQuery: queryParts.join(' ') } : {}),
    maxItems: filters.limit,
    startPage: 1,
    takePages: estimatePages(filters),
  };
}

/** Cuántas páginas facturadas va a consumir. Es lo que se le promete al usuario. */
export function estimatePages(filters: ProspectFilters): number {
  return Math.max(1, Math.ceil(filters.limit / PROFILES_PER_PAGE));
}

/**
 * `https://www.linkedin.com/in/ACwAAAFPO7MB…` → `in/ACwAAAFPO7MB…`
 *
 * El slug no es legible: el actor devuelve el id interno de LinkedIn, no el
 * nombre de usuario. Igual sirve como identidad estable dentro de la fuente y
 * la URL se rearma anteponiendo el dominio, que es lo que necesita `linkedinUrl()`.
 */
export function slugFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  const m = /linkedin\.com\/(in|company|school)\/([A-Za-z0-9\-_%.]{2,120})/i.exec(url);
  if (!m) return null;
  const slug = m[2].split(/[/?#]/)[0].replace(/\.$/, '');
  return slug.length >= 2 ? `${m[1].toLowerCase()}/${slug}` : null;
}

/** El puesto actual, o el primero que haya. */
export function currentPosition(profile: RawLinkedinProfile): LinkedinPosition | null {
  const positions = profile.currentPositions ?? [];
  return positions.find((p) => p.current) ?? positions[0] ?? null;
}

/** Antigüedad en el cargo, en años (con la fracción de meses). */
export function tenureYears(position: LinkedinPosition | null): number | null {
  const t = position?.tenureAtPosition;
  if (!t) return null;
  const years = t.numYears ?? 0;
  const months = t.numMonths ?? 0;
  const total = years + months / 12;
  return total > 0 ? Math.round(total * 10) / 10 : null;
}

/**
 * Puntaje de una persona.
 *
 * No puede compartir la fórmula de Google: acá no hay fotos, ni reseñas, ni
 * rating. Se mide qué tan cerca está del avatar que se pidió.
 *
 * La ubicación NO puntúa, a propósito: el actor la devuelve a nivel país
 * ("Argentina"), así que premiar o castigar por eso sería premiar ruido.
 */
export function scoreProfile(
  profile: RawLinkedinProfile,
  filters: ProspectFilters,
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 0;

  const position = currentPosition(profile);
  const title = (position?.title ?? '').toLowerCase();
  const wanted = (filters.linkedin?.jobTitles?.length ? filters.linkedin.jobTitles : filters.queries)
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean);

  // El cargo es la señal más fuerte: es literalmente lo que se pidió.
  const exacto = wanted.some((t) => title.includes(t));
  // Coincidencia por palabra suelta: "gerente comercial" contra "Gerente de Ventas".
  const parcial =
    !exacto &&
    wanted.some((t) =>
      t
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .some((w) => title.includes(w)),
    );

  if (exacto) {
    score += 45;
    reasons.push('El cargo coincide con lo buscado');
  } else if (parcial) {
    score += 22;
    reasons.push('Cargo parecido al buscado');
  } else if (title) {
    score += 8;
    reasons.push(`Cargo distinto: ${position?.title}`);
  } else {
    reasons.push('Sin cargo visible');
  }

  if (position?.companyName) {
    score += 20;
    reasons.push(`Trabaja en ${position.companyName.trim()}`);
  } else {
    reasons.push('Sin empresa actual visible');
  }

  // Antigüedad: alguien asentado en el cargo decide más que un recién llegado.
  const anios = tenureYears(position);
  if (anios !== null && anios >= 3) {
    score += 20;
    reasons.push(`${Math.floor(anios)} años en el cargo`);
  } else if (anios !== null && anios >= 1) {
    score += 12;
    reasons.push(`${Math.floor(anios)} año(s) en el cargo`);
  } else if (anios !== null) {
    score += 5;
    reasons.push('Recién asumió el cargo');
  }

  // Un perfil con "Acerca de" escrito es un perfil que alguien mantiene.
  if ((profile.summary ?? '').trim().length > 80) {
    score += 10;
    reasons.push('Perfil desarrollado');
  }

  return { score: Math.max(0, Math.min(100, Math.round(score))), reasons };
}

/**
 * Traduce lo que devolvió el actor al formato común de resultado.
 *
 * NO filtra por puntaje: el puntaje ordena. Filtrar por un número que el
 * vendedor no puede calibrar es la forma más silenciosa de llegar a cero
 * resultados sin entender por qué.
 */
export function mapLinkedinProfiles(
  items: RawLinkedinProfile[],
  filters: ProspectFilters,
): ProspectResult[] {
  const seen = new Set<string>();
  const results: ProspectResult[] = [];

  for (const profile of items ?? []) {
    const slug = slugFromUrl(profile.linkedinUrl) ?? (profile.id ? `in/${profile.id}` : null);
    if (!slug) continue;
    // El id de LinkedIn DISTINGUE MAYÚSCULAS (`ACwAAAFPO7MB…`): pasarlo a
    // minúsculas rompía la URL del perfil. Se guarda tal cual y solo la clave de
    // deduplicación se normaliza.
    if (seen.has(slug.toLowerCase())) continue;
    seen.add(slug.toLowerCase());

    const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
    if (!name) continue;

    const { score, reasons } = scoreProfile(profile, filters);
    const position = currentPosition(profile);

    results.push({
      source: 'linkedin',
      sourceRef: slug,
      kind: 'person',
      businessName: name,
      address: profile.location?.linkedinText ?? null,
      area: profile.location?.city ?? profile.location?.linkedinText ?? filters.areas[0] ?? '',
      phone: null,
      whatsappPhone: null,
      website: null,
      instagram: null,
      linkedin: slug,
      mapsUrl: null,
      rating: null,
      reviewsCount: 0,
      photosCount: 0,
      // Una persona no tiene "web propia": es una señal de Google que acá no se
      // midió. En false para no inventar un dato.
      hasOwnWebsite: false,
      score,
      reasons,
      roleTitle: position?.title ?? null,
      companyName: position?.companyName?.trim() ?? null,
      /** El "Acerca de": lo usa el mensaje asistido para no escribir genérico. */
      bio: profile.summary ?? null,
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, filters.limit);
}

// Búsqueda de personas en LinkedIn vía Apify — SOLO servidor.
//
// Actor: `harvestapi/linkedin-profile-search`. Se eligió **por no pedir
// cookies**: hay actores más baratos que usan la sesión de LinkedIn del propio
// usuario, y eso puede terminar en su cuenta personal restringida. Acá el
// usuario no expone nada suyo.
//
// Precios: US$ 0,10 por página de 25 perfiles, más US$ 0,01 por perfil si se
// pide la búsqueda de email.
//
// ⚠️ EL ACTOR DEVUELVE DOS FORMAS DISTINTAS SEGÚN EL MODO.
// Verificado con corridas reales (2026-08-17). En `Short` los campos son
// `linkedinUrl`, `summary` y `currentPositions[]`; en `Full` son
// `publicIdentifier`, `headline`, `about`, `currentPosition` (singular) y
// `emails[]`. La documentación describe **solo la forma de Full**, y por eso no
// coincidía con lo que veíamos.
//
// Eso costó dos diagnósticos: primero el mapeo usaba los nombres de la doc y
// descartaba TODOS los perfiles en Short (0 resultados sin importar los
// filtros); después, arreglado para Short, devolvía los perfiles de Full sin
// cargo ni empresa. Ahora acepta las dos formas y toma lo que encuentre.
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
  /** El cargo. `title` en modo Short, `position` en modo Full. */
  title?: string;
  position?: string;
  companyName?: string;
  description?: string;
  current?: boolean;
  /** Modo Short: la antigüedad ya viene desglosada. */
  tenureAtPosition?: { numYears?: number; numMonths?: number };
  /** Modo Full: viene como texto, "26 yrs 8 mos". */
  duration?: string;
  endDate?: { text?: string };
}

/**
 * Un email con su diagnóstico de entregabilidad.
 *
 * `status: "risky"` casi siempre significa dominio catch-all: acepta cualquier
 * dirección, así que no se puede confirmar que esa casilla exista de verdad. Se
 * guarda igual —es mejor que nada— pero se marca, porque mandar una campaña a
 * direcciones inventadas quema el dominio del remitente.
 */
export interface LinkedinEmail {
  email?: string;
  status?: string;
  qualityScore?: number;
  free?: boolean;
  catchAllDomain?: boolean;
}

/**
 * Un perfil, en CUALQUIERA de las dos formas que devuelve el actor.
 *
 * Y son dos de verdad, según el modo — esto costó dos diagnósticos:
 *
 * | | `Short` | `Full` / `Full + email search` |
 * |---|---|---|
 * | identidad | solo `linkedinUrl` (con el id interno) | `publicIdentifier` legible |
 * | titular | no hay | `headline` |
 * | puesto | `currentPositions[]` | `currentPosition` (singular) |
 * | texto propio | `summary` | `about` |
 * | email | no hay | `emails[]` |
 *
 * La documentación describe la forma de `Full`, que es por qué no coincidía con
 * lo que veíamos en `Short`. El mapeo acepta las dos y toma lo que encuentre.
 */
export interface RawLinkedinProfile {
  id?: string;
  /** Solo en modo Full: el slug legible del perfil. */
  publicIdentifier?: string;
  linkedinUrl?: string;
  firstName?: string;
  lastName?: string;
  /** Solo en modo Full: el titular del perfil. */
  headline?: string;
  /** El "Acerca de". `summary` en Short, `about` en Full. */
  summary?: string;
  about?: string;
  /** Short devuelve el array; Full, un único puesto. */
  currentPositions?: LinkedinPosition[];
  currentPosition?: LinkedinPosition | LinkedinPosition[];
  /** Solo en modo "Full + email search". Son objetos, no strings. */
  emails?: (LinkedinEmail | string)[];
  companyWebsites?: string[];
  location?: { linkedinText?: string; city?: string; countryCode?: string };
  connectionsCount?: number;
  followerCount?: number;
  verified?: boolean;
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
/**
 * Deja la zona como LinkedIn la espera.
 *
 * En Google Places la zona es texto libre dentro de una búsqueda ("inmobiliaria
 * en Palermo, Buenos Aires"), así que una aclaración de más no molesta. En
 * LinkedIn es un **filtro de coincidencia exacta**: si el lugar no existe con
 * ese nombre, no devuelve nada.
 *
 * Medido con dos corridas reales idénticas salvo la zona:
 *   "Colombia (todo el país)" → 0 perfiles
 *   "Colombia"                → 3 perfiles
 *
 * Turbo escribe etiquetas para que las lea una persona ("Colombia (todo el
 * país)", "Buenos Aires - AMBA"), y eso dejaba la búsqueda en cero sin que
 * ningún filtro nuestro descartara nada. Se limpia acá y no solo en el prompt
 * porque una regla de redacción se puede desobedecer; esto no.
 */
export function cleanLocation(area: string): string {
  const limpio = area
    // Aclaraciones entre paréntesis: "(todo el país)", "(Colombia)".
    .replace(/\([^)]*\)/g, ' ')
    // Varios lugares en una línea: se queda con el primero.
    .split(/\s+[-–—/|]\s+/)[0]
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[,;.]+$/, '');
  // Si limpiar lo dejó vacío, es mejor mandar el original que no mandar nada.
  return limpio.length >= 2 ? limpio : area.trim();
}

export function buildLinkedinInput(filters: ProspectFilters): Record<string, unknown> {
  const li = filters.linkedin;
  const titles = li?.jobTitles?.length ? li.jobTitles : filters.queries;

  // Todo lo que no se puede mapear a un filtro estructurado va como texto.
  const queryParts = [...(li?.industries ?? []), ...(li?.seniority ?? [])].filter(Boolean);

  return {
    profileScraperMode: 'Short',
    ...(titles.length > 0 ? { currentJobTitles: titles } : {}),
    ...(filters.areas.length > 0
      ? { locations: [...new Set(filters.areas.map(cleanLocation).filter(Boolean))] }
      : {}),
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

/** El puesto actual, venga como array (Short) o como `currentPosition` (Full). */
export function mainPosition(profile: RawLinkedinProfile): LinkedinPosition | null {
  const sueltas = profile.currentPosition;
  const positions = [
    ...(profile.currentPositions ?? []),
    ...(Array.isArray(sueltas) ? sueltas : sueltas ? [sueltas] : []),
  ];
  // Short marca el puesto vigente con `current`; Full, con endDate "Present".
  const vigente = positions.find((p) => p.current || p.endDate?.text === 'Present');
  return vigente ?? positions[0] ?? null;
}

/** El cargo, se llame `title` (Short) o `position` (Full). */
export function positionTitle(position: LinkedinPosition | null): string | null {
  const t = (position?.title ?? position?.position ?? '').trim();
  return t.length > 0 ? t : null;
}

/** El "Acerca de" del perfil: `about` en Full, `summary` en Short. */
export function profileBio(profile: RawLinkedinProfile): string | null {
  const texto = (profile.about ?? profile.summary ?? '').trim();
  return texto.length > 0 ? texto : null;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/**
 * El mejor email del perfil, con su nivel de confianza.
 *
 * Solo aparece en modo "Full + email search", y **viene como objeto**, no como
 * texto: `{ email, status, qualityScore, catchAllDomain }`. Se prefiere el de
 * mejor puntaje y se marca cuál es dudoso — un `status: "risky"` suele ser un
 * dominio catch-all, que acepta cualquier dirección y por lo tanto no confirma
 * que la casilla exista. Mandar una campaña a direcciones así quema el dominio
 * del remitente, y eso el vendedor tiene que saberlo antes, no después.
 */
export function profileEmail(
  profile: RawLinkedinProfile,
): { email: string; confiable: boolean } | null {
  const candidatos = (profile.emails ?? [])
    .map((e) => (typeof e === 'string' ? { email: e } : e))
    .filter((e): e is LinkedinEmail => Boolean(e?.email))
    .map((e) => ({ ...e, email: e.email!.trim().toLowerCase() }))
    .filter((e) => EMAIL_RE.test(e.email))
    .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0));

  const mejor = candidatos[0];
  if (!mejor) return null;
  return {
    email: mejor.email,
    confiable: mejor.status === 'valid' || (!mejor.catchAllDomain && mejor.status !== 'invalid'),
  };
}

/**
 * Antigüedad en el cargo, en años.
 *
 * Modo Short la trae desglosada; modo Full, como texto ("26 yrs 8 mos",
 * "1 yr", "5 mos"). Se aceptan las dos.
 */
export function tenureYears(position: LinkedinPosition | null): number | null {
  const t = position?.tenureAtPosition;
  if (t) {
    const total = (t.numYears ?? 0) + (t.numMonths ?? 0) / 12;
    return total > 0 ? Math.round(total * 10) / 10 : null;
  }

  const texto = position?.duration;
  if (!texto) return null;
  const años = Number(/(\d+)\s*(?:yrs?|años?|year)/i.exec(texto)?.[1] ?? 0);
  const meses = Number(/(\d+)\s*(?:mos?|meses|month)/i.exec(texto)?.[1] ?? 0);
  const total = años + meses / 12;
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

  const position = mainPosition(profile);
  // El titular sirve tanto como el cargo: en modo Full el puesto puede venir sin
  // `title` y el cargo real estar solo en `headline`.
  const title = `${positionTitle(position) ?? ''} ${profile.headline ?? ''}`.toLowerCase().trim();
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
    reasons.push(`Cargo distinto: ${positionTitle(position) ?? profile.headline}`);
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
  if ((profileBio(profile) ?? '').length > 80) {
    score += 10;
    reasons.push('Perfil desarrollado');
  }

  // El email cambia el caso de uso: se le puede escribir sin depender de que
  // acepte la solicitud en LinkedIn.
  const correo = profileEmail(profile);
  if (correo) reasons.push(correo.confiable ? 'Tiene email' : 'Tiene email (sin confirmar)');

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
    // `publicIdentifier` (modo Full) es el slug legible y es mejor identidad que
    // el id interno que trae la URL en modo Short.
    const slug = profile.publicIdentifier?.trim()
      ? `in/${profile.publicIdentifier.trim()}`
      : (slugFromUrl(profile.linkedinUrl) ?? (profile.id ? `in/${profile.id}` : null));
    if (!slug) continue;
    // El id de LinkedIn DISTINGUE MAYÚSCULAS (`ACwAAAFPO7MB…`): pasarlo a
    // minúsculas rompía la URL del perfil. Se guarda tal cual y solo la clave de
    // deduplicación se normaliza.
    if (seen.has(slug.toLowerCase())) continue;
    seen.add(slug.toLowerCase());

    const name = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
    if (!name) continue;

    const { score, reasons } = scoreProfile(profile, filters);
    const position = mainPosition(profile);

    results.push({
      source: 'linkedin',
      sourceRef: slug,
      kind: 'person',
      businessName: name,
      address: profile.location?.linkedinText ?? null,
      area: profile.location?.city ?? profile.location?.linkedinText ?? filters.areas[0] ?? '',
      phone: null,
      whatsappPhone: null,
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
      roleTitle: positionTitle(position) ?? profile.headline ?? null,
      companyName: position?.companyName?.trim() ?? null,
      /** El "Acerca de": lo usa el mensaje asistido para no escribir genérico. */
      bio: profileBio(profile),
      // Solo en modo "Full + email search". Es lo que permite escribirle sin
      // depender de que acepte la solicitud en LinkedIn.
      email: profileEmail(profile)?.email ?? null,
      website: profile.companyWebsites?.[0] ?? null,
    });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, filters.limit);
}
